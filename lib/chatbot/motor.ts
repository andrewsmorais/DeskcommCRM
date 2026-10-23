/**
 * Motor do Chatbot Builder — PURO: recebe o desenho (grafo), o ponto em que a
 * conversa está (sessão) e a mensagem que chegou, e devolve o que fazer
 * (efeitos) e a sessão nova. Não lê banco, não envia nada, não chama IA.
 * Quem executa os efeitos é `lib/chatbot/executar.ts`.
 *
 * Regras que valem para todo passo:
 *   - um passo sem ligação de saída termina o fluxo (sessão `completed`);
 *   - "Pedir para escolher" e "Pedir para digitar" PARAM e esperam a próxima
 *     mensagem do contato (sessão `waiting_input`);
 *   - transferir e finalizar encerram a participação do chatbot;
 *   - no máximo `LIMITE_DE_PASSOS` passos por mensagem: um desenho em círculo
 *     sem pergunta no meio não pode prender o worker nem inundar o contato.
 */
import {
  lerConfig,
  type CampoDoContato,
  type Grafo,
  type TipoDePasso,
  ehTipoDePasso,
} from "./passos";
import {
  contatoVazio,
  normalizar,
  regraVale,
  valorDoCampo,
  type ContatoDoTurno,
} from "./regras";

export { normalizar };

export const LIMITE_DE_PASSOS = 40;

export type StatusDaSessao = "running" | "waiting_input" | "completed" | "transferred";

export type SessaoDoChatbot = {
  no_atual: string | null;
  status: StatusDaSessao;
  tentativas: number;
  dados: Record<string, string>;
};

export type Efeito =
  | { tipo: "enviar"; texto: string }
  | { tipo: "transferir_equipe" }
  | { tipo: "transferir_atendente"; user_id: string | null }
  | { tipo: "etiquetas"; adicionar: string[]; remover: string[] }
  | { tipo: "nota"; texto: string }
  | { tipo: "campo_contato"; campo: CampoDoContato; chave: string; valor: string }
  | { tipo: "finalizar" };

export type ContextoDoTurno = {
  /** Texto da mensagem do contato que disparou este turno (null = sem texto, ex.: áudio). */
  mensagem: string | null;
  agora: Date;
  /** Fuso da organização, ex.: "America/Sao_Paulo". */
  fuso: string;
  /** Etiquetas e campos do contato, para "Definir condição". Ausente = contato vazio. */
  contato?: ContatoDoTurno;
};

export type ResultadoDoTurno = { sessao: SessaoDoChatbot; efeitos: Efeito[]; passos: number };

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

function proximo(grafo: Grafo, deNo: string, saida: string): string | null {
  const ligacao =
    grafo.edges.find((e) => e.source === deNo && (e.sourceHandle ?? "proximo") === saida) ??
    // Ligação feita antes de o passo ter saídas nomeadas: vale como "proximo".
    // Nunca a de "Valor inválido": o valor gravado não pode cair no caminho do erro.
    (saida === "proximo"
      ? grafo.edges.find((e) => e.source === deNo && e.sourceHandle !== "invalido")
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
  let atual: string | null = inicio;
  let resposta = respondendo;
  let passos = 0;

  const fim = (status: StatusDaSessao): ResultadoDoTurno => {
    sessao.status = status;
    sessao.no_atual = null;
    sessao.tentativas = 0;
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
        break;
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
        return fim("transferred");
      }
      case "transferir_atendente": {
        const c = lerConfig("transferir_atendente", no.data);
        if (c.mensagem)
          efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({ tipo: "transferir_atendente", user_id: c.user_id });
        return fim("transferred");
      }
      case "finalizar_conversa": {
        const c = lerConfig("finalizar_conversa", no.data);
        if (c.mensagem)
          efeitos.push({ tipo: "enviar", texto: preencher(c.mensagem, sessao.dados) });
        efeitos.push({ tipo: "finalizar" });
        return fim("completed");
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

/** Começa o fluxo a partir do passo de início. */
export function iniciarFluxo(grafo: Grafo, inicio: string, ctx: ContextoDoTurno): ResultadoDoTurno {
  return andar(grafo, sessaoNova(), inicio, ctx, false);
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
