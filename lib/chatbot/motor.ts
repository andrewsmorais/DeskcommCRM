/**
 * Motor do Chatbot Builder — PURO: recebe o desenho (grafo), o ponto em que a
 * conversa está (sessão) e a mensagem que chegou, e devolve o que fazer
 * (efeitos) e a sessão nova. Não lê banco, não envia nada, não chama IA.
 * Quem executa os efeitos é `lib/chatbot/executar.ts`.
 *
 * Regras que valem para todo passo:
 *   - um passo sem ligação de saída termina o fluxo (sessão `completed`);
 *   - "Pedir para escolher", "Pedir para digitar", "Pedir para avaliar" e
 *     "Pedir feedback escrito" PARAM e esperam a próxima mensagem do contato
 *     (sessão `waiting_input`);
 *   - "Aguardar intervalo" e "Aguardar até" PARAM no relógio (sessão
 *     `waiting_timer`, com `retomar_em`); quem acorda é `retomarFluxo`;
 *   - "WebHook" PARA com `pendente`: o executor faz a chamada (o motor não
 *     faz rede) e devolve a resposta em `continuarAposWebhook`;
 *   - "Agendar horário" também para com `pendente` duas vezes: para o executor
 *     buscar os horários livres (`continuarComHorarios`) e para marcar o que o
 *     contato escolheu (`continuarAposMarcar`);
 *   - "Acionar outro fluxo" encerra este fluxo com `pendente`: o executor lê o
 *     outro desenho e o começa com as mesmas respostas;
 *   - transferir e finalizar encerram a participação do chatbot — a não ser a
 *     mensagem de espera da transferência, que o relógio manda enquanto
 *     ninguém da equipe responde (`proximaMensagemDeEspera`);
 *   - no máximo `LIMITE_DE_PASSOS` passos por mensagem: um desenho em círculo
 *     sem pergunta no meio não pode prender o worker nem inundar o contato.
 */
import {
  lerConfig,
  type CampoDoContato,
  type Grafo,
  type TipoDeMidia,
  type TipoDePasso,
  ehTipoDePasso,
} from "./passos";
import {
  contatoVazio,
  normalizar,
  notaDaResposta,
  regraVale,
  valorDoCampo,
  type ContatoDoTurno,
} from "./regras";
import { fimDoIntervalo, proximoHorario } from "./relogio";

export { normalizar };

export const LIMITE_DE_PASSOS = 40;

export type StatusDaSessao =
  | "running"
  | "waiting_input"
  | "waiting_timer"
  | "completed"
  | "transferred";

export type SessaoDoChatbot = {
  no_atual: string | null;
  status: StatusDaSessao;
  tentativas: number;
  dados: Record<string, string>;
  /** ISO. Só em `waiting_timer`: quando o fluxo volta a andar. */
  retomar_em?: string | null;
};

export type Efeito =
  | { tipo: "enviar"; texto: string }
  | { tipo: "midia"; storage_path: string; midia: TipoDeMidia; mime: string; legenda: string }
  | { tipo: "negocio"; pipeline_id: string; stage_id: string; titulo: string }
  | { tipo: "transferir_equipe" }
  | { tipo: "transferir_atendente"; user_id: string | null }
  | { tipo: "etiquetas"; adicionar: string[]; remover: string[] }
  | { tipo: "nota"; texto: string }
  | { tipo: "campo_contato"; campo: CampoDoContato; chave: string; valor: string }
  | { tipo: "avaliacao"; nota: number; escala: "1_5" | "0_10" }
  | { tipo: "followup"; pointer_id: string }
  | { tipo: "feedback"; texto: string }
  /** `texto` com as respostas do contato; `modelo` é o que quem montou o fluxo escreveu, sem elas. */
  | { tipo: "notificar"; texto: string; modelo: string }
  /** Bloqueia o contato (`contacts.is_blocked`). Vem antes de "finalizar". */
  | { tipo: "bloquear" }
  /** Abre o pedido de exclusão dos dados (LGPD), que um admin aprova. */
  | { tipo: "pedido_exclusao" }
  | { tipo: "finalizar" };

/**
 * O que as condições "da conversa" leem — o executor busca no banco uma vez
 * por turno; o teste da tela deixa quem testa escolher.
 */
export type FatosDaConversa = {
  /** Número de WhatsApp (channel_session_id). */
  canal: string | null;
  /** Atendente com a conversa (assigned_to_user_id). */
  atendente: string | null;
  /** ISO da última mensagem do contato. */
  ultima_entrada_em: string | null;
  /** A última mensagem da conversa é do contato (ninguém respondeu ainda). */
  aguardando_resposta: boolean;
  /** Nenhuma mensagem do contato antes deste atendimento. */
  primeira_conversa: boolean;
  /** Alguém da equipe pode assumir agora. */
  equipe_disponivel: boolean;
  /** O agente de IA ou outro chatbot está atendendo a conversa. */
  outro_bot: boolean;
};

export function fatosVazios(): FatosDaConversa {
  return {
    canal: null,
    atendente: null,
    ultima_entrada_em: null,
    aguardando_resposta: false,
    primeira_conversa: false,
    equipe_disponivel: false,
    outro_bot: false,
  };
}

export type ContextoDoTurno = {
  /** Texto da mensagem do contato que disparou este turno (null = sem texto, ex.: áudio). */
  mensagem: string | null;
  agora: Date;
  /** Fuso da organização, ex.: "America/Sao_Paulo". */
  fuso: string;
  /** Etiquetas e campos do contato, para "Definir condição". Ausente = contato vazio. */
  contato?: ContatoDoTurno;
  /** Para as condições da conversa (canal, atendente, presença…). Ausente = tudo "não". */
  conversa?: FatosDaConversa;
  /** Sorteio do "Distribuir fluxo", entre 0 e 1. Ausente = Math.random. */
  sorteio?: () => number;
};

/** O que o executor precisa fazer FORA do motor (rede, banco) antes de o fluxo seguir. */
export type Pendente =
  | { tipo: "webhook"; no: string }
  /** Começar outro desenho: o executor lê o fluxo e chama `iniciarFluxo`. */
  | { tipo: "fluxo"; no: string; flow_id: string }
  /** Buscar os horários livres e devolver em `continuarComHorarios`. */
  | { tipo: "horarios"; no: string }
  /** Marcar o horário escolhido e devolver em `continuarAposMarcar`. */
  | { tipo: "marcar"; no: string; inicio: string };

export type ResultadoDoTurno = {
  sessao: SessaoDoChatbot;
  efeitos: Efeito[];
  passos: number;
  /** O fluxo parou num passo que o executor precisa fazer fora (rede) e devolver. */
  pendente?: Pendente;
};

/** Um horário oferecido: `inicio` é o instante (ISO); `quando`, o que o contato lê. */
export type OfertaDeHorario = { inicio: string; quando: string };

/** O que o executor devolve depois de tentar marcar. */
export type ResultadoDaMarcacao =
  | { ok: true; aguardaConfirmacao: boolean }
  /** `ocupado` = o horário acabou de ser pego: o fluxo oferece de novo. */
  | { ok: false; ocupado: boolean };

/** Chave interna (não é variável de quem monta o fluxo): os horários oferecidos. */
export const CHAVE_DOS_HORARIOS = "_horarios";

/** O que o executor devolve depois de chamar o WebHook. */
export type RespostaDoWebhook = { ok: boolean; status: number | null; corpo: unknown };

type No = Grafo["nodes"][number];

/** Troca {{variavel}} pelo que o contato respondeu em "Pedir para digitar". */
export function preencher(texto: string, dados: Record<string, string>): string {
  return texto.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (_, nome: string) => dados[nome] ?? "");
}

function horaLocal(agora: Date, fuso: string): { minutos: number; diaDaSemana: number } {
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(agora);
  } catch {
    partes = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(agora);
  }
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minutos: Number(v("hour")) * 60 + Number(v("minute")),
    diaDaSemana: Math.max(0, dias.indexOf(v("weekday"))),
  };
}

function emMinutos(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Faixa que passa da meia-noite (22:00–06:00) também vale. */
export function dentroDasFaixas(
  minutos: number,
  faixas: { inicio: string; fim: string }[],
): boolean {
  return faixas.some(({ inicio, fim }) => {
    const a = emMinutos(inicio);
    const b = emMinutos(fim);
    return a <= b ? minutos >= a && minutos < b : minutos >= a || minutos < b;
  });
}

/** Qual opção o contato escolheu: o número ("2", "2.", "opção 2") ou o texto da opção. */
export function opcaoEscolhida(resposta: string, opcoes: string[]): number | null {
  const r = normalizar(resposta);
  const numero = r.match(/^(?:opcao\s*)?(\d{1,2})\s*[.)-]?$/);
  if (numero) {
    const i = Number(numero[1]) - 1;
    return i >= 0 && i < opcoes.length ? i : null;
  }
  const i = opcoes.findIndex((o) => normalizar(o) === r);
  return i >= 0 ? i : null;
}

function textoDasOpcoes(pergunta: string, opcoes: string[]): string {
  const lista = opcoes.map((o, i) => `${i + 1}. ${o}`).join("\n");
  return pergunta ? `${pergunta}\n\n${lista}` : lista;
}

const SAIDAS_DE_ERRO = new Set(["invalido", "invalida", "falha", "sem_horario"]);

/** Os horários guardados na sessão; lixo vira lista vazia. */
export function ofertasGuardadas(dados: Record<string, string>): OfertaDeHorario[] {
  try {
    const lista = JSON.parse(dados[CHAVE_DOS_HORARIOS] ?? "[]") as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.filter(
      (o): o is OfertaDeHorario =>
        typeof o === "object" &&
        o !== null &&
        typeof (o as OfertaDeHorario).inicio === "string" &&
        typeof (o as OfertaDeHorario).quando === "string",
    );
  } catch {
    return [];
  }
}

/** As respostas guardadas sem as chaves internas (as que começam com "_"). */
export function respostasVisiveis(dados: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(dados).filter(([k]) => !k.startsWith("_")));
}

function proximo(grafo: Grafo, deNo: string, saida: string): string | null {
  const ligacao =
    grafo.edges.find((e) => e.source === deNo && (e.sourceHandle ?? "proximo") === saida) ??
    // Ligação feita antes de o passo ter saídas nomeadas: vale como "proximo".
    // Nunca uma saída de erro ("Valor inválido", "Não avaliou", "Falhou"): o
    // caminho do acerto não pode cair no caminho do erro.
    (saida === "proximo"
      ? grafo.edges.find((e) => e.source === deNo && !SAIDAS_DE_ERRO.has(e.sourceHandle ?? ""))
      : undefined);
  return ligacao?.target ?? null;
}

/** O passo de início que responde a esta conversa, ou null se o chatbot não deve começar. */
export function pontoDePartida(
  grafo: Grafo,
  entrada: { channelSessionId: string | null; mensagem: string | null },
): string | null {
  for (const no of grafo.nodes) {
    if (no.type !== "inicio_canal") continue;
    const c = lerConfig("inicio_canal", no.data);
    if (c.channel_session_id && c.channel_session_id !== entrada.channelSessionId) continue;
    if (c.gatilho === "palavra_chave") {
      const m = normalizar(entrada.mensagem ?? "");
      if (!m || !c.palavras.some((p) => m.includes(normalizar(p)))) continue;
    }
    return no.id;
  }
  return null;
}

/**
 * Anda pelo desenho a partir de `inicio` até parar numa pergunta, transferir,
 * finalizar ou ficar sem saída. `respondendo` = a mensagem do contato é a
 * resposta à pergunta em que a sessão estava parada.
 */
function andar(
  grafo: Grafo,
  sessaoInicial: SessaoDoChatbot,
  inicio: string,
  ctx: ContextoDoTurno,
  respondendo: boolean,
): ResultadoDoTurno {
  const efeitos: Efeito[] = [];
  const sessao: SessaoDoChatbot = { ...sessaoInicial, dados: { ...sessaoInicial.dados } };
  const porId = new Map(grafo.nodes.map((n) => [n.id, n]));
  // Cópia do contato que acompanha o que o próprio fluxo grava neste turno:
  // "Editar etiquetas" seguido de "Definir condição" enxerga a etiqueta nova.
  const base = ctx.contato ?? contatoVazio();
  const contato: ContatoDoTurno = {
    ...base,
    tags: [...base.tags],
    personalizados: { ...base.personalizados },
  };
  const fatos = ctx.conversa ?? fatosVazios();
  let atual: string | null = inicio;
  let resposta = respondendo;
  let passos = 0;

  sessao.retomar_em = null;
  const fim = (status: StatusDaSessao): ResultadoDoTurno => {
    sessao.status = status;
    sessao.no_atual = null;
    sessao.tentativas = 0;
    return { sessao, efeitos, passos };
  };
  /** Transferiu. Com mensagem de espera, o relógio fica armado sobre a sessão transferida. */
  const transferido = (
    noId: string,
    c: { espera_minutos: number; espera_mensagem: string },
  ): ResultadoDoTurno => {
    if (c.espera_minutos <= 0 || !c.espera_mensagem) return fim("transferred");
    sessao.status = "transferred";
    sessao.no_atual = noId;
    sessao.tentativas = 0;
    sessao.retomar_em = new Date(ctx.agora.getTime() + c.espera_minutos * 60_000).toISOString();
    return { sessao, efeitos, passos };
  };
  const esperarRelogio = (noId: string, ate: Date): ResultadoDoTurno => {
    sessao.status = "waiting_timer";
    sessao.no_atual = noId;
    sessao.tentativas = 0;
    sessao.retomar_em = ate.toISOString();
    return { sessao, efeitos, passos };
  };

  while (atual) {
    if (passos >= LIMITE_DE_PASSOS) return fim("completed");
    passos += 1;
    const no: No | undefined = porId.get(atual);
    // Passo apagado do desenho enquanto a conversa estava nele: encerra sem erro.
    if (!no || !ehTipoDePasso(no.type)) return fim("completed");
    const tipo = no.type as TipoDePasso;
    let saida = "proximo";

    switch (tipo) {
      case "inicio_canal":
      case "inicio_automacao":
      case "inicio_manual":
        break;
      case "distribuir_fluxo": {
        const c = lerConfig("distribuir_fluxo", no.data);
        const total = c.saidas.reduce((t, x) => t + x.peso, 0);
        let alvo = (ctx.sorteio ?? Math.random)() * total;
        let i = 0;
        for (; i < c.saidas.length - 1; i++) {
          alvo -= c.saidas[i]!.peso;
          if (alvo < 0) break;
        }
        saida = `saida-${i}`;
        break;
      }
      case "contato_ativo": {
        const c = lerConfig("contato_ativo", no.data);
        const ultima = fatos.ultima_entrada_em ? new Date(fatos.ultima_entrada_em).getTime() : NaN;
        saida = ctx.agora.getTime() - ultima <= c.horas * 3_600_000 ? "sim" : "nao";
        break;
      }
      case "tem_etiqueta": {
        const c = lerConfig("tem_etiqueta", no.data);
        const tem = (t: string) => contato.tags.some((x) => normalizar(x) === normalizar(t));
        saida =
          c.etiquetas.length > 0 &&
          (c.modo === "todas" ? c.etiquetas.every(tem) : c.etiquetas.some(tem))
            ? "sim"
            : "nao";
        break;
      }
      case "primeira_conversa":
        saida = fatos.primeira_conversa ? "sim" : "nao";
        break;
      case "canal_da_conversa":
        saida =
          fatos.canal && lerConfig("canal_da_conversa", no.data).canais.includes(fatos.canal)
            ? "sim"
            : "nao";
        break;
      case "atendente_da_conversa": {
        const c = lerConfig("atendente_da_conversa", no.data);
        saida =
          fatos.atendente && (c.atendentes.length === 0 || c.atendentes.includes(fatos.atendente))
            ? "sim"
            : "nao";
        break;
      }
      case "presenca_do_atendente":
        saida = fatos.equipe_disponivel ? "sim" : "nao";
        break;
      case "bot_paralelo":
        saida = fatos.outro_bot ? "sim" : "nao";
        break;
      case "status_da_conversa":
        saida = fatos.aguardando_resposta ? "sim" : "nao";
        break;
      case "bloquear_contato": {
        const c = lerConfig("bloquear_contato", no.data);
        if (c.mensagem) efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({ tipo: "bloquear" }, { tipo: "finalizar" });
        return fim("completed");
      }
      case "excluir_contato": {
        const c = lerConfig("excluir_contato", no.data);
        if (c.mensagem) efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({ tipo: "pedido_exclusao" });
        break;
      }
      case "enviar_mensagem": {
        const c = lerConfig("enviar_mensagem", no.data);
        const texto = preencher(c.texto, sessao.dados).trim();
        if (texto) efeitos.push({ tipo: "enviar", texto });
        break;
      }
      case "pedir_escolher": {
        const c = lerConfig("pedir_escolher", no.data);
        if (!resposta) {
          efeitos.push({
            tipo: "enviar",
            texto: textoDasOpcoes(preencher(c.pergunta, sessao.dados), c.opcoes),
          });
          sessao.no_atual = no.id;
          sessao.status = "waiting_input";
          sessao.tentativas = 0;
          return { sessao, efeitos, passos };
        }
        resposta = false;
        const i = ctx.mensagem === null ? null : opcaoEscolhida(ctx.mensagem, c.opcoes);
        if (i !== null) {
          sessao.tentativas = 0;
          saida = `opcao-${i}`;
          break;
        }
        sessao.tentativas += 1;
        if (sessao.tentativas < c.tentativas) {
          efeitos.push({
            tipo: "enviar",
            texto: `${c.mensagem_invalida}\n\n${textoDasOpcoes("", c.opcoes)}`,
          });
          sessao.no_atual = no.id;
          sessao.status = "waiting_input";
          return { sessao, efeitos, passos };
        }
        sessao.tentativas = 0;
        saida = "invalida";
        break;
      }
      case "pedir_digitar": {
        const c = lerConfig("pedir_digitar", no.data);
        if (!resposta) {
          const pergunta = preencher(c.pergunta, sessao.dados).trim();
          if (pergunta) efeitos.push({ tipo: "enviar", texto: pergunta });
          sessao.no_atual = no.id;
          sessao.status = "waiting_input";
          return { sessao, efeitos, passos };
        }
        resposta = false;
        sessao.dados[c.variavel] = (ctx.mensagem ?? "").trim().slice(0, 1000);
        break;
      }
      case "mensagem_contem": {
        const c = lerConfig("mensagem_contem", no.data);
        const m = normalizar(ctx.mensagem ?? "");
        saida = m && c.palavras.some((p) => m.includes(normalizar(p))) ? "sim" : "nao";
        break;
      }
      case "horarios": {
        const c = lerConfig("horarios", no.data);
        saida = dentroDasFaixas(horaLocal(ctx.agora, ctx.fuso).minutos, c.faixas)
          ? "dentro"
          : "fora";
        break;
      }
      case "dias_semana": {
        const c = lerConfig("dias_semana", no.data);
        saida = c.dias.includes(horaLocal(ctx.agora, ctx.fuso).diaDaSemana) ? "sim" : "nao";
        break;
      }
      case "editar_etiquetas": {
        const c = lerConfig("editar_etiquetas", no.data);
        if (c.adicionar.length || c.remover.length) {
          efeitos.push({ tipo: "etiquetas", adicionar: c.adicionar, remover: c.remover });
          const sai = new Set(c.remover.map(normalizar));
          contato.tags = contato.tags.filter((t) => !sai.has(normalizar(t)));
          for (const t of c.adicionar)
            if (!contato.tags.some((x) => normalizar(x) === normalizar(t))) contato.tags.push(t);
        }
        break;
      }
      case "criar_nota": {
        const texto = preencher(lerConfig("criar_nota", no.data).texto, sessao.dados).trim();
        if (texto) efeitos.push({ tipo: "nota", texto });
        break;
      }
      case "campo_contato": {
        const c = lerConfig("campo_contato", no.data);
        const valor = valorDoCampo(c.campo, preencher(c.valor, sessao.dados));
        if (valor === null || (c.campo === "personalizado" && !c.chave)) {
          saida = "invalido";
          break;
        }
        efeitos.push({ tipo: "campo_contato", campo: c.campo, chave: c.chave, valor });
        if (c.campo === "personalizado") contato.personalizados[c.chave] = valor;
        else contato[c.campo] = valor;
        break;
      }
      case "definir_condicao": {
        const c = lerConfig("definir_condicao", no.data);
        saida = regraVale(c.regra, { mensagem: ctx.mensagem, dados: sessao.dados, contato })
          ? "sim"
          : "nao";
        break;
      }
      case "multi_condicional": {
        const c = lerConfig("multi_condicional", no.data);
        const i = c.regras.findIndex((r) =>
          regraVale(r, { mensagem: ctx.mensagem, dados: sessao.dados, contato }),
        );
        saida = i >= 0 ? `regra-${i}` : "nenhuma";
        break;
      }
      case "transferir_equipe": {
        const c = lerConfig("transferir_equipe", no.data);
        if (c.mensagem)
          efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({ tipo: "transferir_equipe" });
        return transferido(no.id, c);
      }
      case "transferir_atendente": {
        const c = lerConfig("transferir_atendente", no.data);
        if (c.mensagem)
          efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({ tipo: "transferir_atendente", user_id: c.user_id });
        return transferido(no.id, c);
      }
      case "enviar_midia": {
        const c = lerConfig("enviar_midia", no.data);
        if (c.storage_path && c.tipo)
          efeitos.push({
            tipo: "midia",
            storage_path: c.storage_path,
            midia: c.tipo,
            mime: c.mime,
            legenda: preencher(c.legenda, sessao.dados).trim(),
          });
        break;
      }
      case "negocio_funil": {
        const c = lerConfig("negocio_funil", no.data);
        if (c.pipeline_id && c.stage_id)
          efeitos.push({
            tipo: "negocio",
            pipeline_id: c.pipeline_id,
            stage_id: c.stage_id,
            titulo: preencher(c.titulo, sessao.dados).trim(),
          });
        break;
      }
      case "acionar_fluxo": {
        const c = lerConfig("acionar_fluxo", no.data);
        const r = fim("completed");
        return c.flow_id ? { ...r, pendente: { tipo: "fluxo", no: no.id, flow_id: c.flow_id } } : r;
      }
      case "agendar_horario": {
        const c = lerConfig("agendar_horario", no.data);
        if (!resposta) {
          // Chegou no passo: o executor busca os horários livres.
          sessao.no_atual = no.id;
          sessao.status = "running";
          sessao.tentativas = 0;
          return { sessao, efeitos, passos, pendente: { tipo: "horarios", no: no.id } };
        }
        resposta = false;
        const ofertas = ofertasGuardadas(sessao.dados);
        if (ofertas.length === 0) {
          sessao.no_atual = no.id;
          sessao.status = "running";
          return { sessao, efeitos, passos, pendente: { tipo: "horarios", no: no.id } };
        }
        const i =
          ctx.mensagem === null ? null : opcaoEscolhida(ctx.mensagem, ofertas.map((o) => o.quando));
        const escolhida = i === null ? undefined : ofertas[i];
        if (escolhida) {
          sessao.tentativas = 0;
          sessao.dados.horario = escolhida.quando;
          sessao.dados.horario_inicio = escolhida.inicio;
          sessao.no_atual = no.id;
          sessao.status = "running";
          return { sessao, efeitos, passos, pendente: { tipo: "marcar", no: no.id, inicio: escolhida.inicio } };
        }
        sessao.tentativas += 1;
        if (sessao.tentativas < c.tentativas) {
          efeitos.push({
            tipo: "enviar",
            texto: `${c.mensagem_invalida}\n\n${textoDasOpcoes("", ofertas.map((o) => o.quando))}`,
          });
          sessao.no_atual = no.id;
          sessao.status = "waiting_input";
          return { sessao, efeitos, passos };
        }
        sessao.tentativas = 0;
        delete sessao.dados[CHAVE_DOS_HORARIOS];
        saida = "invalida";
        break;
      }
      case "finalizar_conversa": {
        const c = lerConfig("finalizar_conversa", no.data);
        if (c.mensagem)
          efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({ tipo: "finalizar" });
        return fim("completed");
      }
      case "pedir_avaliacao": {
        const c = lerConfig("pedir_avaliacao", no.data);
        if (!resposta) {
          const pergunta = preencher(c.pergunta, sessao.dados).trim();
          if (pergunta) efeitos.push({ tipo: "enviar", texto: pergunta });
          sessao.no_atual = no.id;
          sessao.status = "waiting_input";
          sessao.tentativas = 0;
          return { sessao, efeitos, passos };
        }
        resposta = false;
        const nota = ctx.mensagem === null ? null : notaDaResposta(ctx.mensagem, c.escala);
        if (nota !== null) {
          sessao.tentativas = 0;
          sessao.dados.avaliacao = String(nota);
          efeitos.push({ tipo: "avaliacao", nota, escala: c.escala });
          break;
        }
        sessao.tentativas += 1;
        if (sessao.tentativas < c.tentativas) {
          efeitos.push({ tipo: "enviar", texto: c.mensagem_invalida });
          sessao.no_atual = no.id;
          sessao.status = "waiting_input";
          return { sessao, efeitos, passos };
        }
        sessao.tentativas = 0;
        saida = "invalida";
        break;
      }
      case "pedir_feedback": {
        const c = lerConfig("pedir_feedback", no.data);
        if (!resposta) {
          const pergunta = preencher(c.pergunta, sessao.dados).trim();
          if (pergunta) efeitos.push({ tipo: "enviar", texto: pergunta });
          sessao.no_atual = no.id;
          sessao.status = "waiting_input";
          return { sessao, efeitos, passos };
        }
        resposta = false;
        const texto = (ctx.mensagem ?? "").trim().slice(0, 2000);
        sessao.dados.feedback = texto;
        if (texto) efeitos.push({ tipo: "feedback", texto });
        break;
      }
      case "iniciar_followup": {
        const c = lerConfig("iniciar_followup", no.data);
        if (c.pointer_id) efeitos.push({ tipo: "followup", pointer_id: c.pointer_id });
        break;
      }
      case "notificar_atendente": {
        const { mensagem } = lerConfig("notificar_atendente", no.data);
        const texto = preencher(mensagem, sessao.dados).trim();
        const modelo = mensagem.replace(/\{\{[^}]*\}\}/g, "…").trim();
        efeitos.push({ tipo: "notificar", texto, modelo });
        break;
      }
      case "webhook":
        sessao.no_atual = no.id;
        sessao.status = "running";
        sessao.tentativas = 0;
        return { sessao, efeitos, passos, pendente: { tipo: "webhook", no: no.id } };
      case "aguardar_intervalo":
        return esperarRelogio(no.id, fimDoIntervalo(lerConfig("aguardar_intervalo", no.data), ctx.agora));
      case "aguardar_ate":
        return esperarRelogio(
          no.id,
          proximoHorario(lerConfig("aguardar_ate", no.data), ctx.agora, ctx.fuso),
        );
      case "bloco_de_notas":
        return fim("completed");
    }

    atual = proximo(grafo, no.id, saida);
    // "Valor inválido" sem ligação: o fluxo segue pelo caminho normal em vez de
    // morrer ali — quem não desenhou o "pedir de novo" não perde o resto.
    if (!atual && saida === "invalido") atual = proximo(grafo, no.id, "proximo");
  }
  return fim("completed");
}

export function sessaoNova(): SessaoDoChatbot {
  return { no_atual: null, status: "running", tentativas: 0, dados: {} };
}

/** Começa o fluxo a partir do passo de início. `dados` = variáveis que já chegam prontas (automação). */
export function iniciarFluxo(
  grafo: Grafo,
  inicio: string,
  ctx: ContextoDoTurno,
  dados: Record<string, string> = {},
): ResultadoDoTurno {
  return andar(grafo, { ...sessaoNova(), dados: { ...dados } }, inicio, ctx, false);
}

/** O passo "Iniciar manualmente" do desenho, se houver. */
export function inicioManual(grafo: Grafo): string | null {
  return grafo.nodes.find((n) => n.type === "inicio_manual")?.id ?? null;
}

/** O passo "Iniciar por automação" do desenho, se houver. */
export function inicioPorAutomacao(grafo: Grafo): string | null {
  return grafo.nodes.find((n) => n.type === "inicio_automacao")?.id ?? null;
}

/** O desenho responde a mensagens que chegam (tem "Iniciar por um canal")? */
export function respondeMensagens(grafo: Grafo): boolean {
  return grafo.nodes.some((n) => n.type === "inicio_canal");
}

/**
 * Acorda o fluxo parado no relógio: segue pela saída do passo de espera.
 * `ctx.mensagem` é a mensagem que chegou durante a espera (quando o passo diz
 * "seguir se o contato responder") ou null (quando foi o relógio que venceu).
 */
export function retomarFluxo(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  const parada = sessao.status === "waiting_timer" && sessao.no_atual ? sessao.no_atual : null;
  const seguinte = parada ? proximo(grafo, parada, "proximo") : null;
  if (!seguinte) {
    return {
      sessao: { ...sessao, status: "completed", no_atual: null, retomar_em: null },
      efeitos: [],
      passos: 0,
    };
  }
  return andar(grafo, { ...sessao, status: "running" }, seguinte, ctx, false);
}

/** `a.b.0.c` dentro do JSON; só valor simples (texto, número, sim/não) conta. */
export function valorNoCaminho(corpo: unknown, caminho: string): string | null {
  let atual: unknown = corpo;
  for (const parte of caminho.split(".")) {
    if (atual === null || typeof atual !== "object") return null;
    atual = Array.isArray(atual) ? atual[Number(parte)] : (atual as Record<string, unknown>)[parte];
  }
  if (typeof atual === "string") return atual.slice(0, 1000);
  if (typeof atual === "number" || typeof atual === "boolean") return String(atual);
  return null;
}

/**
 * Continua o fluxo depois do WebHook: guarda `{{webhook_status}}` e os campos
 * pedidos da resposta, e segue por "Deu certo" ou "Falhou". "Falhou" sem
 * ligação encerra o fluxo — seguir pelo caminho do sucesso mandaria ao contato
 * uma resposta com as variáveis vazias.
 */
export function continuarAposWebhook(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  resposta: RespostaDoWebhook,
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  const parada = grafo.nodes.find((n) => n.id === sessao.no_atual && n.type === "webhook");
  const encerrado = (): ResultadoDoTurno => ({
    sessao: { ...sessao, status: "completed", no_atual: null, tentativas: 0, retomar_em: null },
    efeitos: [],
    passos: 0,
  });
  if (!parada) return encerrado();
  const c = lerConfig("webhook", parada.data);
  const dados: Record<string, string> = { ...sessao.dados, webhook_status: String(resposta.status ?? 0) };
  if (resposta.ok) {
    for (const campo of c.campos) {
      const valor = valorNoCaminho(resposta.corpo, campo.caminho);
      dados[campo.variavel] = valor ?? "";
    }
  }
  const seguinte = proximo(grafo, parada.id, resposta.ok ? "proximo" : "falha");
  if (!seguinte) return { ...encerrado(), sessao: { ...encerrado().sessao, dados } };
  return andar(grafo, { ...sessao, dados, status: "running" }, seguinte, ctx, false);
}

/** O passo de espera em que a sessão parou deixa a mensagem nova acordar o fluxo? */
export function seguirAoResponder(grafo: Grafo, noId: string | null): boolean {
  const no = grafo.nodes.find((n) => n.id === noId);
  if (no?.type === "aguardar_intervalo")
    return lerConfig("aguardar_intervalo", no.data).se_responder === "seguir";
  if (no?.type === "aguardar_ate") return lerConfig("aguardar_ate", no.data).se_responder === "seguir";
  return true;
}

/** Continua a conversa que estava parada esperando resposta. */
export function continuarFluxo(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  if (sessao.status !== "waiting_input" || !sessao.no_atual) {
    return { sessao: { ...sessao, status: "completed", no_atual: null }, efeitos: [], passos: 0 };
  }
  return andar(grafo, sessao, sessao.no_atual, ctx, true);
}

/**
 * Os horários livres chegaram (executor). Sem nenhum, segue por "Sem horário
 * livre"; com horários, pergunta e espera a escolha.
 */
export function continuarComHorarios(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  ofertas: OfertaDeHorario[],
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  const parada = grafo.nodes.find((n) => n.id === sessao.no_atual && n.type === "agendar_horario");
  if (!parada) {
    return { sessao: { ...sessao, status: "completed", no_atual: null, retomar_em: null }, efeitos: [], passos: 0 };
  }
  const c = lerConfig("agendar_horario", parada.data);
  const dados = { ...sessao.dados };
  if (ofertas.length === 0) {
    delete dados[CHAVE_DOS_HORARIOS];
    const seguinte = proximo(grafo, parada.id, "sem_horario");
    if (!seguinte)
      return { sessao: { ...sessao, dados, status: "completed", no_atual: null, tentativas: 0, retomar_em: null }, efeitos: [], passos: 0 };
    return andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false);
  }
  dados[CHAVE_DOS_HORARIOS] = JSON.stringify(ofertas);
  return {
    sessao: { ...sessao, dados, status: "waiting_input", no_atual: parada.id, retomar_em: null },
    efeitos: [
      {
        tipo: "enviar",
        texto: textoDasOpcoes(preencher(c.pergunta, dados).trim(), ofertas.map((o) => o.quando)),
      },
    ],
    passos: 0,
  };
}

/**
 * O executor tentou marcar. Marcou: confirma ao contato e segue por "Marcou".
 * O horário acabou de ser pego por outra pessoa: avisa e oferece de novo.
 * Outra recusa (tipo desativado, sem responsável): segue por "Sem horário livre".
 */
export function continuarAposMarcar(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  r: ResultadoDaMarcacao,
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  const parada = grafo.nodes.find((n) => n.id === sessao.no_atual && n.type === "agendar_horario");
  if (!parada) {
    return { sessao: { ...sessao, status: "completed", no_atual: null, retomar_em: null }, efeitos: [], passos: 0 };
  }
  const c = lerConfig("agendar_horario", parada.data);
  const dados = { ...sessao.dados };
  delete dados[CHAVE_DOS_HORARIOS];
  if (!r.ok && r.ocupado) {
    return {
      sessao: { ...sessao, dados, status: "running", no_atual: parada.id },
      efeitos: [{ tipo: "enviar", texto: "Esse horário acabou de ser ocupado. Veja os que estão livres agora:" }],
      passos: 0,
      pendente: { tipo: "horarios", no: parada.id },
    };
  }
  if (!r.ok) {
    delete dados.horario;
    delete dados.horario_inicio;
    const seguinte = proximo(grafo, parada.id, "sem_horario");
    if (!seguinte)
      return { sessao: { ...sessao, dados, status: "completed", no_atual: null, tentativas: 0, retomar_em: null }, efeitos: [], passos: 0 };
    return andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false);
  }
  dados.agendamento_status = r.aguardaConfirmacao ? "aguardando confirmação" : "confirmado";
  const texto = preencher(r.aguardaConfirmacao ? c.confirmacao_pendente : c.confirmacao, dados).trim();
  const efeitos: Efeito[] = texto ? [{ tipo: "enviar", texto }] : [];
  const seguinte = proximo(grafo, parada.id, "proximo");
  if (!seguinte)
    return { sessao: { ...sessao, dados, status: "completed", no_atual: null, tentativas: 0, retomar_em: null }, efeitos, passos: 0 };
  const depois = andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false);
  return { ...depois, efeitos: [...efeitos, ...depois.efeitos] };
}

/** O passo de início que outro fluxo usa para começar este ("Acionar outro fluxo"). */
export function inicioParaAcionar(grafo: Grafo): string | null {
  return (
    grafo.nodes.find((n) => n.type === "inicio_automacao")?.id ??
    grafo.nodes.find((n) => n.type === "inicio_manual")?.id ??
    grafo.nodes.find((n) => n.type === "inicio_canal")?.id ??
    null
  );
}

/**
 * O relógio da espera venceu numa conversa transferida em que ninguém da
 * equipe respondeu: a mensagem a mandar e a sessão com o próximo horário (ou
 * sem relógio, quando foi a última vez). null = o passo não pede espera.
 */
export function proximaMensagemDeEspera(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  agora: Date,
): { texto: string; sessao: SessaoDoChatbot } | null {
  const no = grafo.nodes.find((n) => n.id === sessao.no_atual);
  if (!no || (no.type !== "transferir_equipe" && no.type !== "transferir_atendente")) return null;
  const c = lerConfig(no.type, no.data);
  if (c.espera_minutos <= 0 || !c.espera_mensagem) return null;
  const texto = preencher(c.espera_mensagem, sessao.dados).trim();
  if (!texto) return null;
  const enviadas = sessao.tentativas + 1;
  return {
    texto,
    sessao: {
      ...sessao,
      status: "transferred",
      tentativas: enviadas,
      retomar_em:
        enviadas < c.espera_vezes
          ? new Date(agora.getTime() + c.espera_minutos * 60_000).toISOString()
          : null,
    },
  };
}
