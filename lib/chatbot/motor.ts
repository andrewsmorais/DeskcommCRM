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
 *   - "Transferir p/ agentes de IA" e "Enviar template" param com `pendente`:
 *     o executor tenta (entregar ao agente / mandar o modelo) e devolve se deu
 *     certo em `continuarAposAcao`;
 *   - "Enviar formulário" faz uma pergunta por mensagem (sessão
 *     `waiting_input`), com a posição guardada em `CHAVE_DO_FORMULARIO`;
 *   - transferir e finalizar encerram a participação do chatbot — a não ser a
 *     mensagem de espera da transferência, que o relógio manda enquanto
 *     ninguém da equipe responde (`proximaMensagemDeEspera`);
 *   - no máximo `LIMITE_DE_PASSOS` passos por mensagem: um desenho em círculo
 *     sem pergunta no meio não pode prender o worker nem inundar o contato.
 */
import {
  lerConfig,
  lerConfigOuNada,
  saidasDoPasso,
  type CampoDoContato,
  type ConfigDe,
  type FormatoDeResposta,
  type Grafo,
  type ModoDeAtendente,
  type TipoDeMidia,
  type TipoDePasso,
  ehTipoDePasso,
} from "./passos";
import {
  aplicarEtiquetas,
  contatoVazio,
  normalizar,
  notaDaResposta,
  regraVale,
  respostaDoFormulario,
  respostaNoFormato,
  primeiraOpcaoQueBate,
  valorDoCampo,
  temEtiqueta,
  valorVale,
  type ContatoDoTurno,
} from "./regras";
import { fimDoIntervalo, instanteDaData, proximoHorario } from "./relogio";
import { ehFeriado } from "./feriados";

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
  | {
      tipo: "enviar";
      texto: string;
      /**
       * As opções clicáveis deste texto (o texto já as traz numeradas). Vai no
       * envio como `metadata.escolhas`; o canal que sabe desenhar botão ou
       * lista desenha, o que não sabe manda o texto (lib/channels/escolhas.ts).
       */
      escolhas?: { pergunta: string; opcoes: string[] };
    }
  | { tipo: "midia"; storage_path: string; midia: TipoDeMidia; mime: string; legenda: string }
  | { tipo: "negocio"; pipeline_id: string; stage_id: string; titulo: string }
  /** `setor_id` null = equipe toda. */
  | { tipo: "transferir_equipe"; setor_id: string | null }
  | {
      tipo: "transferir_atendente";
      modo: ModoDeAtendente;
      user_id: string | null;
      /** Rodízio e menos conversas: só entre estes (vazio = quem pode receber). */
      atendentes: string[];
    }
  /** `alvo`: etiquetas do contato ou da conversa ("Editar etiquetas"). */
  | { tipo: "etiquetas"; alvo: "contato" | "conversa"; adicionar: string[]; remover: string[] }
  | { tipo: "nota"; texto: string }
  /** Cartão de contato ("Enviar contato"). */
  | { tipo: "contato"; nome: string; telefone: string }
  /** Produto do Catálogo, lido na hora do envio ("Enviar produto"). */
  | { tipo: "produto"; produto_id: string; mensagem: string }
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
  /** Liga ou desliga as mensagens de espera das transferências desta conversa. */
  | { tipo: "fluxo_de_espera"; ligar: boolean }
  /** Torna a conversa privada ou a libera (`conversations.is_private`). */
  | { tipo: "privacidade"; privada: boolean }
  /** "Visibilidade da conversa" (migration 0510). */
  | { tipo: "visibilidade"; visibilidade: "visivel" | "oculta" | "oculta_ate_mensagem" }
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
  /** Setor da conversa (conversations.setor_id), ou null. */
  setor: string | null;
  /** Negócios ABERTOS do contato: funil e etapa ("Etapa do funil"). */
  negocios: { funil: string; etapa: string }[];
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
    setor: null,
    negocios: [],
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
  | {
      tipo: "marcar";
      no: string;
      inicio: string;
      /** "Reagendar horário": o compromisso que muda de horário (em vez de nascer um novo). */
      agendamento_id?: string;
    }
  /** Cancelar o próximo compromisso do contato e devolver em `continuarAposCancelar`. */
  | { tipo: "cancelar"; no: string }
  /** Devolver a conversa ao agente de IA e dizer se deu certo em `continuarAposAcao`. */
  | { tipo: "ia"; no: string; agent_id: string | null }
  /** Mandar o modelo aprovado e dizer se saiu em `continuarAposAcao`. */
  | { tipo: "template"; no: string; template_id: string };

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

/** Chave interna: qual pergunta do "Enviar formulário" está esperando resposta (0, 1, 2…). */
export const CHAVE_DO_FORMULARIO = "_formulario";

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

/** O dia de hoje no fuso da empresa, "AAAA-MM-DD". */
function dataLocal(agora: Date, fuso: string): string {
  const formatar = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
  try {
    return formatar(fuso);
  } catch {
    return formatar("America/Sao_Paulo");
  }
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

const SAIDAS_DE_ERRO = new Set([
  "invalido",
  "invalida",
  "falha",
  "sem_horario",
  "sem_resposta",
  "sem_agendamento",
  "vencida",
]);

/** O compromisso que o "Reagendar horário" vai mudar (guardado ao buscar os horários). */
export const CHAVE_DO_AGENDAMENTO = "_agendamento_id";

/** Os dois passos que oferecem horários da Agenda (mesmo caminho no motor). */
const PASSOS_DE_HORARIO = new Set(["agendar_horario", "reagendar_horario"]);

/** A localização como texto: nome, endereço e o link do mapa. */
export function textoDaLocalizacao(
  c: ConfigDe<"enviar_localizacao">,
  dados: Record<string, string>,
): string {
  const consulta =
    c.latitude !== null && c.longitude !== null
      ? `${c.latitude},${c.longitude}`
      : encodeURIComponent(preencher(c.endereco, dados).trim());
  if (!consulta) return "";
  const partes = [
    preencher(c.mensagem, dados).trim(),
    c.nome ? `📍 *${preencher(c.nome, dados).trim()}*` : "",
    preencher(c.endereco, dados).trim(),
    // O mesmo host de mapa da localização que chega (`lib/messaging/localizacao.ts`):
    // o celular abre o app de mapas; o código não chama o host.
    `https://maps.google.com/?q=${consulta}`,
  ].filter(Boolean);
  return partes.join("\n");
}

/**
 * As mensagens do "Enviar link de pagamento": o texto com o link e, à parte,
 * o Pix copia e cola (numa mensagem só dele, para o contato copiar inteiro), e
 * a nota que a equipe lê. null quando não sobra link nem Pix depois de
 * preencher as variáveis.
 */
export function mensagensDoPagamento(
  c: ConfigDe<"enviar_pagamento">,
  dados: Record<string, string>,
): { mensagens: string[]; nota: string } | null {
  const link = preencher(c.link, dados).trim();
  const pix = preencher(c.pix, dados).trim();
  if (!link && !pix) return null;
  const descricao = preencher(c.descricao, dados).trim();
  const valor = preencher(c.valor, dados).trim();
  const partes: string[] = [];
  const abertura = preencher(c.mensagem, dados).trim();
  if (abertura) partes.push(abertura);
  if (descricao || valor)
    partes.push(`💳 *${descricao || "Pagamento"}*${valor ? ` — ${valor}` : ""}`);
  if (link) partes.push(`Pague por aqui: ${link}`);
  if (pix) partes.push("Ou pague com Pix copia e cola, na próxima mensagem.");
  const mensagens = [partes.join("\n\n")];
  if (pix) mensagens.push(pix);
  const oQue = [descricao, valor].filter(Boolean).join(" — ");
  return {
    mensagens,
    nota: `O chatbot enviou o link de pagamento${oQue ? ` (${oQue})` : ""}. Ele não confere se foi pago.`,
  };
}

/**
 * O que o chatbot diz ao contato quando a resposta do "Pedir para digitar" não
 * está no formato e quem montou o fluxo não escreveu outra mensagem. Vai para
 * o contato, então é texto do fluxo (português), como os padrões dos passos.
 */
/** "Pedir para digitar" com várias opções: a resposta não bateu com nenhuma. */
export const MENSAGEM_NENHUMA_OPCAO = "Não entendi a sua resposta. Pode tentar de novo?";

export const MENSAGEM_FORA_DO_FORMATO: Record<FormatoDeResposta, string> = {
  qualquer: "Não consegui ler sua resposta. Pode mandar de novo?",
  email: "Esse e-mail não parece certo. Pode mandar de novo? Exemplo: nome@email.com",
  telefone: "Esse telefone não parece certo. Pode mandar de novo, com o DDD?",
  cpf: "Esse CPF não parece certo. Pode conferir e mandar de novo? Só os 11 números já servem.",
  cnpj: "Esse CNPJ não parece certo. Pode conferir e mandar de novo? Só os 14 números já servem.",
  numero: "Preciso de um número. Pode mandar de novo?",
  data: "Não entendi a data. Pode mandar no formato dia/mês/ano? Exemplo: 25/12/2026",
  hora: "Não entendi o horário. Pode mandar assim? Exemplo: 14:30",
};

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
  return inicioQueAtende(grafo, entrada)?.id ?? null;
}

/**
 * O início que atende e o tipo de gatilho dele.
 *
 * A palavra-chave vence o "toda conversa nova", seja qual for a ordem dos
 * passos no desenho: antes vencia o primeiro do array, que a tela não mostra, e
 * um início por palavra-chave colocado depois de um "toda conversa nova" nunca
 * disparava. Início cuja config não se lê não atende (o padrão dele pega tudo).
 */
export function inicioQueAtende(
  grafo: Grafo,
  entrada: { channelSessionId: string | null; mensagem: string | null },
): { id: string; gatilho: "toda_conversa_nova" | "palavra_chave" } | null {
  let geral: string | null = null;
  const m = normalizar(entrada.mensagem ?? "");
  for (const no of grafo.nodes) {
    if (no.type !== "inicio_canal") continue;
    const c = lerConfigOuNada("inicio_canal", no.data);
    if (!c) continue;
    if (c.channel_session_id && c.channel_session_id !== entrada.channelSessionId) continue;
    if (c.gatilho === "palavra_chave") {
      if (m && c.palavras.some((p) => m.includes(normalizar(p))))
        return { id: no.id, gatilho: "palavra_chave" };
      continue;
    }
    geral ??= no.id;
  }
  return geral ? { id: geral, gatilho: "toda_conversa_nova" } : null;
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
  /**
   * A mensagem do turno ainda não respondeu passo nenhum e nada saiu depois
   * dela ("Usar a mensagem anterior" do Pedir para digitar). Só o começo de um
   * fluxo e a volta do relógio garantem isso; a continuação depois de uma ação
   * (webhook, modelo, agenda) e o fluxo acionado por outro não garantem.
   */
  mensagemLivre = !respondendo,
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
    tags_da_conversa: [...(base.tags_da_conversa ?? [])],
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
  /** A pergunta espera a resposta; com prazo, o relógio leva a "Não respondeu a tempo". */
  const esperarResposta = (noId: string, prazoMinutos: number): ResultadoDoTurno => {
    sessao.no_atual = noId;
    sessao.status = "waiting_input";
    sessao.retomar_em =
      prazoMinutos > 0
        ? new Date(ctx.agora.getTime() + prazoMinutos * 60_000).toISOString()
        : null;
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
      case "inicio_canal": {
        // Etiqueta de origem: a frase da mensagem que abriu a conversa.
        const m = normalizar(ctx.mensagem ?? "");
        const novas = m
          ? [
              ...new Set(
                lerConfig("inicio_canal", no.data)
                  .origens.filter((o) => m.includes(normalizar(o.frase)))
                  .map((o) => o.etiqueta),
              ),
            ].filter((t) => !contato.tags.some((x) => normalizar(x) === normalizar(t)))
          : [];
        if (novas.length > 0) {
          efeitos.push({ tipo: "etiquetas", alvo: "contato", adicionar: novas, remover: [] });
          contato.tags.push(...novas);
        }
        break;
      }
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
        const tem = (t: string) => temEtiqueta(contato, t);
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
      case "etapa_do_funil": {
        const c = lerConfig("etapa_do_funil", no.data);
        saida = fatos.negocios.some(
          (n) =>
            n.funil === c.pipeline_id && (c.etapas.length === 0 || c.etapas.includes(n.etapa)),
        )
          ? "sim"
          : "nao";
        break;
      }
      case "setor_da_conversa":
        saida =
          fatos.setor && lerConfig("setor_da_conversa", no.data).setores.includes(fatos.setor)
            ? "sim"
            : "nao";
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
        let texto = preencher(c.texto, sessao.dados).trim();
        // Botão de link: vira texto embaixo da mensagem (QR code não tem botão).
        const url = preencher(c.botao_url, sessao.dados).trim();
        if (url) texto = `${texto}\n\n${c.botao_texto ? `${c.botao_texto}: ` : ""}${url}`.trim();
        if (texto) efeitos.push({ tipo: "enviar", texto });
        break;
      }
      case "enviar_pagamento": {
        const p = mensagensDoPagamento(lerConfig("enviar_pagamento", no.data), sessao.dados);
        if (!p) {
          // {{link_checkout}} vazio, por exemplo: mandar "pague por aqui:" sem
          // link seria pior que não mandar. Segue por "Sem link".
          saida = "falha";
          break;
        }
        for (const texto of p.mensagens) efeitos.push({ tipo: "enviar", texto });
        efeitos.push({ tipo: "nota", texto: p.nota });
        break;
      }
      case "enviar_localizacao": {
        const texto = textoDaLocalizacao(lerConfig("enviar_localizacao", no.data), sessao.dados);
        if (texto) efeitos.push({ tipo: "enviar", texto });
        break;
      }
      case "enviar_contato": {
        const c = lerConfig("enviar_contato", no.data);
        if (c.nome && c.telefone)
          efeitos.push({
            tipo: "contato",
            nome: preencher(c.nome, sessao.dados).trim(),
            telefone: c.telefone,
          });
        break;
      }
      case "enviar_produto": {
        const c = lerConfig("enviar_produto", no.data);
        if (c.produto_id)
          efeitos.push({
            tipo: "produto",
            produto_id: c.produto_id,
            mensagem: preencher(c.mensagem, sessao.dados).trim(),
          });
        break;
      }
      case "cancelar_agendamento":
        sessao.no_atual = no.id;
        sessao.status = "running";
        return { sessao, efeitos, passos, pendente: { tipo: "cancelar", no: no.id } };
      case "pedir_escolher": {
        const c = lerConfig("pedir_escolher", no.data);
        if (!resposta) {
          efeitos.push({
            tipo: "enviar",
            texto: textoDasOpcoes(preencher(c.pergunta, sessao.dados), c.opcoes),
            escolhas: { pergunta: preencher(c.pergunta, sessao.dados).trim(), opcoes: c.opcoes },
          });
          sessao.tentativas = 0;
          return esperarResposta(no.id, c.prazo_minutos);
        }
        resposta = false;
        const i = ctx.mensagem === null ? null : opcaoEscolhida(ctx.mensagem, c.opcoes);
        if (i !== null) {
          sessao.tentativas = 0;
          if (c.variavel) sessao.dados[c.variavel] = c.opcoes[i] ?? "";
          saida = `opcao-${i}`;
          break;
        }
        sessao.tentativas += 1;
        if (sessao.tentativas < c.tentativas) {
          efeitos.push({
            tipo: "enviar",
            texto: `${c.mensagem_invalida}\n\n${textoDasOpcoes("", c.opcoes)}`,
            escolhas: { pergunta: c.mensagem_invalida, opcoes: c.opcoes },
          });
          return esperarResposta(no.id, c.prazo_minutos);
        }
        sessao.tentativas = 0;
        saida = "invalida";
        break;
      }
      case "pedir_digitar": {
        const c = lerConfig("pedir_digitar", no.data);
        if (!resposta) {
          // "Usar a mensagem anterior": a mensagem que trouxe este turno
          // responde sem a pergunta — só se ela ainda é a ÚLTIMA da conversa
          // (não respondeu outro passo e o chatbot não falou depois dela).
          const ultima =
            c.usar_mensagem_anterior &&
            mensagemLivre &&
            !!ctx.mensagem?.trim() &&
            !efeitos.some((e) => e.tipo === "enviar" || e.tipo === "midia");
          if (ultima && c.opcoes.length > 0) {
            const bateu = primeiraOpcaoQueBate(c.opcoes, ctx.mensagem ?? "");
            if (bateu) {
              sessao.dados[c.variavel] = bateu.valor;
              sessao.tentativas = 0;
              saida = `opcao-${bateu.indice}`;
              break;
            }
          }
          const pronta =
            ultima && c.opcoes.length === 0 ? respostaNoFormato(c.formato, ctx.mensagem ?? "") : null;
          if (pronta !== null) {
            sessao.dados[c.variavel] = pronta;
            sessao.tentativas = 0;
            break;
          }
          const pergunta = preencher(c.pergunta, sessao.dados).trim();
          if (pergunta) efeitos.push({ tipo: "enviar", texto: pergunta });
          sessao.tentativas = 0;
          return esperarResposta(no.id, c.prazo_minutos);
        }
        resposta = false;
        if (c.opcoes.length > 0) {
          // Várias respostas aceitas: segue pela primeira opção que bate.
          const bateu = primeiraOpcaoQueBate(c.opcoes, ctx.mensagem ?? "");
          if (bateu) {
            sessao.dados[c.variavel] = bateu.valor;
            sessao.tentativas = 0;
            saida = `opcao-${bateu.indice}`;
            break;
          }
        } else {
          const valor = respostaNoFormato(c.formato, ctx.mensagem ?? "");
          if (valor !== null) {
            sessao.dados[c.variavel] = valor;
            sessao.tentativas = 0;
            break;
          }
        }
        sessao.tentativas += 1;
        if (sessao.tentativas < c.tentativas) {
          efeitos.push({
            tipo: "enviar",
            texto:
              c.mensagem_invalida ||
              (c.opcoes.length > 0 ? MENSAGEM_NENHUMA_OPCAO : MENSAGEM_FORA_DO_FORMATO[c.formato]),
          });
          return esperarResposta(no.id, c.prazo_minutos);
        }
        sessao.tentativas = 0;
        saida = "invalida";
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
        // Feriado: o dia todo conta como fora do horário.
        const feriado = ehFeriado(dataLocal(ctx.agora, ctx.fuso), {
          feriados_nacionais: c.feriados_nacionais,
          pontos_facultativos: c.pontos_facultativos,
          datas: c.feriados,
        });
        saida =
          !feriado && dentroDasFaixas(horaLocal(ctx.agora, ctx.fuso).minutos, c.faixas)
            ? "dentro"
            : "fora";
        break;
      }
      case "enviar_oferta": {
        const c = lerConfig("enviar_oferta", no.data);
        if (c.valida_ate && dataLocal(ctx.agora, ctx.fuso) > c.valida_ate) {
          // Vencida: nada sai para o contato.
          saida = "vencida";
          break;
        }
        const [ano, mes, dia] = c.valida_ate.split("-");
        const validade = c.valida_ate ? `${dia}/${mes}/${ano}` : "";
        if (validade) sessao.dados.validade = validade;
        const texto = preencher(c.texto, sessao.dados).trim();
        const rodape =
          validade && c.mostrar_validade && !/\{\{\s*validade\s*\}\}/.test(c.texto)
            ? `\n\n⏳ Válida até ${validade}.`
            : "";
        if (texto) efeitos.push({ tipo: "enviar", texto: `${texto}${rodape}` });
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
          efeitos.push({ tipo: "etiquetas", alvo: c.alvo, adicionar: c.adicionar, remover: c.remover });
          if (c.alvo === "conversa")
            contato.tags_da_conversa = aplicarEtiquetas(contato.tags_da_conversa, c.adicionar, c.remover);
          else contato.tags = aplicarEtiquetas(contato.tags, c.adicionar, c.remover);
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
      case "condicao_campo_contato": {
        const { regra } = lerConfig("condicao_campo_contato", no.data);
        saida = regraVale(
          { ...regra, fonte: "campo_contato" },
          { mensagem: ctx.mensagem, dados: sessao.dados, contato },
        )
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
        efeitos.push({ tipo: "transferir_equipe", setor_id: c.setor_id });
        return transferido(no.id, c);
      }
      case "transferir_atendente": {
        const c = lerConfig("transferir_atendente", no.data);
        if (c.mensagem)
          efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({
          tipo: "transferir_atendente",
          modo: c.modo,
          user_id: c.modo === "especifico" ? c.user_id : null,
          atendentes: c.modo === "rodizio" || c.modo === "menos_conversas" ? c.atendentes : [],
        });
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
      case "agendar_horario":
      case "reagendar_horario": {
        const c = lerConfig(no.type as "agendar_horario", no.data);
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
          return {
            sessao,
            efeitos,
            passos,
            pendente: {
              tipo: "marcar",
              no: no.id,
              inicio: escolhida.inicio,
              ...(no.type === "reagendar_horario" && sessao.dados[CHAVE_DO_AGENDAMENTO]
                ? { agendamento_id: sessao.dados[CHAVE_DO_AGENDAMENTO] }
                : {}),
            },
          };
        }
        sessao.tentativas += 1;
        if (sessao.tentativas < c.tentativas) {
          efeitos.push({
            tipo: "enviar",
            texto: `${c.mensagem_invalida}\n\n${textoDasOpcoes("", ofertas.map((o) => o.quando))}`,
            escolhas: { pergunta: c.mensagem_invalida, opcoes: ofertas.map((o) => o.quando) },
          });
          return esperarResposta(no.id, c.prazo_minutos);
        }
        sessao.tentativas = 0;
        delete sessao.dados[CHAVE_DOS_HORARIOS];
        saida = "invalida";
        break;
      }
      case "valor": {
        const c = lerConfig("valor", no.data);
        saida = valorVale(c, {
          mensagem: ctx.mensagem,
          dados: sessao.dados,
          contato,
          alvo: preencher(c.valor, sessao.dados),
        })
          ? "sim"
          : "nao";
        break;
      }
      case "transferir_ia":
        // A mensagem só sai depois que a entrega der certo (`continuarAposAcao`):
        // "vou te passar para o assistente" num número sem agente seria mentira.
        sessao.no_atual = no.id;
        sessao.status = "running";
        sessao.tentativas = 0;
        return {
          sessao,
          efeitos,
          passos,
          pendente: { tipo: "ia", no: no.id, agent_id: lerConfig("transferir_ia", no.data).agent_id },
        };
      case "enviar_template": {
        const c = lerConfig("enviar_template", no.data);
        if (!c.template_id) {
          saida = "falha";
          break;
        }
        sessao.no_atual = no.id;
        sessao.status = "running";
        sessao.tentativas = 0;
        return {
          sessao,
          efeitos,
          passos,
          pendente: { tipo: "template", no: no.id, template_id: c.template_id },
        };
      }
      case "enviar_formulario": {
        const c = lerConfig("enviar_formulario", no.data);
        const pergunta = (i: number) => preencher(c.perguntas[i]?.pergunta ?? "", sessao.dados).trim();
        if (!resposta) {
          const abertura = [preencher(c.introducao, sessao.dados).trim(), pergunta(0)]
            .filter(Boolean)
            .join("\n\n");
          if (abertura) efeitos.push({ tipo: "enviar", texto: abertura });
          sessao.dados[CHAVE_DO_FORMULARIO] = "0";
          sessao.tentativas = 0;
          return esperarResposta(no.id, c.prazo_minutos);
        }
        resposta = false;
        const i = Number(sessao.dados[CHAVE_DO_FORMULARIO] ?? "0");
        const atualDoForm = Number.isInteger(i) ? c.perguntas[i] : undefined;
        // O desenho mudou enquanto o contato respondia (pergunta apagada):
        // segue em frente em vez de perguntar o que não existe mais.
        if (!atualDoForm) {
          delete sessao.dados[CHAVE_DO_FORMULARIO];
          sessao.tentativas = 0;
          break;
        }
        const r = ctx.mensagem === null ? null : respostaDoFormulario(atualDoForm, ctx.mensagem, ctx.agora);
        if (r === null) {
          sessao.tentativas += 1;
          if (sessao.tentativas < c.tentativas) {
            efeitos.push({
              tipo: "enviar",
              texto: [c.mensagem_invalida, pergunta(i)].filter(Boolean).join("\n\n"),
            });
            return esperarResposta(no.id, c.prazo_minutos);
          }
          sessao.tentativas = 0;
          delete sessao.dados[CHAVE_DO_FORMULARIO];
          saida = "invalida";
          break;
        }
        sessao.tentativas = 0;
        sessao.dados[atualDoForm.variavel] = r.valor;
        if (atualDoForm.gravar_em && r.gravado !== null) {
          efeitos.push({ tipo: "campo_contato", campo: atualDoForm.gravar_em, chave: "", valor: r.gravado });
          contato[atualDoForm.gravar_em] = r.gravado;
        }
        if (i + 1 < c.perguntas.length) {
          sessao.dados[CHAVE_DO_FORMULARIO] = String(i + 1);
          const proxima = pergunta(i + 1);
          if (proxima) efeitos.push({ tipo: "enviar", texto: proxima });
          return esperarResposta(no.id, c.prazo_minutos);
        }
        delete sessao.dados[CHAVE_DO_FORMULARIO];
        const fecho = preencher(c.conclusao, sessao.dados).trim();
        if (fecho) efeitos.push({ tipo: "enviar", texto: fecho });
        break;
      }
      case "visibilidade_conversa":
        efeitos.push({
          tipo: "visibilidade",
          visibilidade: lerConfig("visibilidade_conversa", no.data).visibilidade,
        });
        break;
      case "privar_liberar":
        efeitos.push({
          tipo: "privacidade",
          privada: lerConfig("privar_liberar", no.data).acao === "privar",
        });
        break;
      case "fluxo_de_espera":
        efeitos.push({
          tipo: "fluxo_de_espera",
          ligar: lerConfig("fluxo_de_espera", no.data).acao === "ligar",
        });
        break;
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
      case "aguardar_ate": {
        const c = lerConfig("aguardar_ate", no.data);
        if (c.quando === "dias") return esperarRelogio(no.id, proximoHorario(c, ctx.agora, ctx.fuso));
        const quando = instanteDaData(c, sessao.dados, ctx.agora, ctx.fuso);
        // Sem data válida (passou, faltou, fora do formato): não espera nada.
        if (!quando) {
          saida = "vencida";
          break;
        }
        return esperarRelogio(no.id, quando);
      }
      case "guardar_valor": {
        const c = lerConfig("guardar_valor", no.data);
        sessao.dados[c.variavel] = preencher(c.valor, sessao.dados).trim().slice(0, 1000);
        break;
      }
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
  /** false quando outro fluxo acionou este: a mensagem do turno já foi usada lá. */
  mensagemLivre = true,
): ResultadoDoTurno {
  return andar(grafo, { ...sessaoNova(), dados: { ...dados } }, inicio, ctx, false, mensagemLivre);
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
/** A pergunta em que a sessão parou ainda tem a saída "Não respondeu a tempo"? */
function perguntaTemPrazo(grafo: Grafo, noId: string): boolean {
  const no = grafo.nodes.find((n) => n.id === noId);
  if (!no || !ehTipoDePasso(no.type)) return false;
  return saidasDoPasso(no.type, no.data).some((s) => s.id === "sem_resposta");
}

export function retomarFluxo(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  // Pergunta com prazo: o relógio venceu sem resposta → "Não respondeu a tempo".
  const semResposta = sessao.status === "waiting_input";
  // O desenho mudou enquanto o contato esperava e a pergunta NÃO tem mais prazo:
  // o relógio antigo não vale. Antes ele acordava assim mesmo, seguia por uma
  // saída que o editor já tinha apagado e encerrava a conversa calado — quem
  // ia responder ficava sem fluxo. Agora a pergunta continua esperando.
  if (semResposta && sessao.no_atual && !perguntaTemPrazo(grafo, sessao.no_atual)) {
    return { sessao: { ...sessao, retomar_em: null }, efeitos: [], passos: 0 };
  }
  const parada =
    (sessao.status === "waiting_timer" || semResposta) && sessao.no_atual ? sessao.no_atual : null;
  const seguinte = parada ? proximo(grafo, parada, semResposta ? "sem_resposta" : "proximo") : null;
  // A pergunta que venceu não volta: a posição do formulário e os horários
  // oferecidos saem, senão um passo igual adiante herdaria o estado dela.
  const dados = { ...sessao.dados };
  if (semResposta) {
    delete dados[CHAVE_DO_FORMULARIO];
    delete dados[CHAVE_DOS_HORARIOS];
  }
  if (!seguinte) {
    return {
      sessao: { ...sessao, dados, status: "completed", no_atual: null, tentativas: 0, retomar_em: null },
      efeitos: [],
      passos: 0,
    };
  }
  return andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false);
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
  return andar(grafo, { ...sessao, dados, status: "running" }, seguinte, ctx, false, false);
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
  /**
   * "Reagendar horário": o compromisso achado (id e quando era) vai para as
   * respostas; `semAgendamento` = o contato não tem compromisso futuro.
   */
  extra: { semAgendamento?: boolean; dados?: Record<string, string> } = {},
): ResultadoDoTurno {
  const parada = grafo.nodes.find(
    (n) => n.id === sessao.no_atual && PASSOS_DE_HORARIO.has(n.type),
  );
  if (!parada) {
    return { sessao: { ...sessao, status: "completed", no_atual: null, retomar_em: null }, efeitos: [], passos: 0 };
  }
  const c = lerConfig(parada.type as "agendar_horario", parada.data);
  const dados = { ...sessao.dados, ...(extra.dados ?? {}) };
  if (extra.semAgendamento || ofertas.length === 0) {
    delete dados[CHAVE_DOS_HORARIOS];
    const seguinte = proximo(grafo, parada.id, extra.semAgendamento ? "sem_agendamento" : "sem_horario");
    if (!seguinte)
      return { sessao: { ...sessao, dados, status: "completed", no_atual: null, tentativas: 0, retomar_em: null }, efeitos: [], passos: 0 };
    return andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false, false);
  }
  dados[CHAVE_DOS_HORARIOS] = JSON.stringify(ofertas);
  // Com prazo, o relógio começa quando a lista sai (é ela a pergunta).
  const retomar_em =
    c.prazo_minutos > 0 ? new Date(ctx.agora.getTime() + c.prazo_minutos * 60_000).toISOString() : null;
  return {
    sessao: { ...sessao, dados, status: "waiting_input", no_atual: parada.id, retomar_em },
    efeitos: [
      {
        tipo: "enviar",
        texto: textoDasOpcoes(preencher(c.pergunta, dados).trim(), ofertas.map((o) => o.quando)),
        escolhas: {
          pergunta: preencher(c.pergunta, dados).trim(),
          opcoes: ofertas.map((o) => o.quando),
        },
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
  const parada = grafo.nodes.find(
    (n) => n.id === sessao.no_atual && PASSOS_DE_HORARIO.has(n.type),
  );
  if (!parada) {
    return { sessao: { ...sessao, status: "completed", no_atual: null, retomar_em: null }, efeitos: [], passos: 0 };
  }
  const c = lerConfig(parada.type as "agendar_horario", parada.data);
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
    return andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false, false);
  }
  dados.agendamento_status = r.aguardaConfirmacao ? "aguardando confirmação" : "confirmado";
  const texto = preencher(r.aguardaConfirmacao ? c.confirmacao_pendente : c.confirmacao, dados).trim();
  const efeitos: Efeito[] = texto ? [{ tipo: "enviar", texto }] : [];
  const seguinte = proximo(grafo, parada.id, "proximo");
  if (!seguinte)
    return { sessao: { ...sessao, dados, status: "completed", no_atual: null, tentativas: 0, retomar_em: null }, efeitos, passos: 0 };
  const depois = andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false, false);
  return { ...depois, efeitos: [...efeitos, ...depois.efeitos] };
}

/**
 * O executor tentou a ação de fora do passo em que a sessão parou:
 *   - "Transferir p/ agentes de IA": entregou → manda a mensagem do passo e o
 *     chatbot sai (`transferred`); não havia agente → segue por "Sem agente de IA";
 *   - "Enviar template": saiu → "Enviado"; recusado → "Não enviado".
 * Saída de falha sem ligação encerra o fluxo (a mesma regra do WebHook): seguir
 * pelo caminho do sucesso faria o fluxo agir como se a mensagem tivesse saído.
 */
export function continuarAposAcao(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  deuCerto: boolean,
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  const parada = grafo.nodes.find((n) => n.id === sessao.no_atual);
  const encerrado = (status: StatusDaSessao, efeitos: Efeito[] = []): ResultadoDoTurno => ({
    sessao: { ...sessao, status, no_atual: null, tentativas: 0, retomar_em: null },
    efeitos,
    passos: 0,
  });
  if (!parada || (parada.type !== "transferir_ia" && parada.type !== "enviar_template"))
    return encerrado("completed");
  if (parada.type === "transferir_ia" && deuCerto) {
    const texto = preencher(lerConfig("transferir_ia", parada.data).mensagem, sessao.dados).trim();
    return encerrado("transferred", texto ? [{ tipo: "enviar", texto }] : []);
  }
  const seguinte = proximo(grafo, parada.id, deuCerto ? "proximo" : "falha");
  if (!seguinte) return encerrado("completed");
  return andar(grafo, { ...sessao, status: "running", tentativas: 0 }, seguinte, ctx, false, false);
}

/**
 * Depois do "Cancelar agendamento": segue por "Cancelado", "Sem agendamento"
 * ou "Não cancelou", com o horário cancelado em {{agendamento}}. Saída de
 * erro sem ligação encerra o fluxo.
 */
export function continuarAposCancelar(
  grafo: Grafo,
  sessao: SessaoDoChatbot,
  desfecho: "cancelado" | "sem_agendamento" | "falha",
  agendamento: string | null,
  ctx: ContextoDoTurno,
): ResultadoDoTurno {
  const parada = grafo.nodes.find(
    (n) => n.id === sessao.no_atual && n.type === "cancelar_agendamento",
  );
  const dados = { ...sessao.dados, ...(agendamento ? { agendamento } : {}) };
  const saida = desfecho === "cancelado" ? "proximo" : desfecho;
  const seguinte = parada ? proximo(grafo, parada.id, saida) : null;
  if (!seguinte)
    return {
      sessao: { ...sessao, dados, status: "completed", no_atual: null, tentativas: 0, retomar_em: null },
      efeitos: [],
      passos: 0,
    };
  return andar(grafo, { ...sessao, dados, status: "running", tentativas: 0 }, seguinte, ctx, false, false);
}

/**
 * Quando rearmar a mensagem de espera de uma transferência ("Fluxo de espera" →
 * ligar): o próximo horário, ou null se o passo não pede espera ou as vezes já
 * acabaram. `tentativas` = quantas mensagens de espera já saíram.
 */
export function relogioDaEspera(
  grafo: Grafo,
  noId: string | null,
  tentativas: number,
  agora: Date,
): string | null {
  const no = grafo.nodes.find((n) => n.id === noId);
  if (!no || (no.type !== "transferir_equipe" && no.type !== "transferir_atendente")) return null;
  const c = lerConfig(no.type, no.data);
  if (c.espera_minutos <= 0 || !c.espera_mensagem || tentativas >= c.espera_vezes) return null;
  return new Date(agora.getTime() + c.espera_minutos * 60_000).toISOString();
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
