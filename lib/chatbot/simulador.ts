/**
 * "Testar" do editor de chatbot — PURO, roda no navegador.
 *
 * Usa o MESMO motor que atende no WhatsApp (lib/chatbot/motor.ts): o que o
 * teste mostra é o que o contato receberia, passo a passo, sem enviar nada,
 * sem gravar nada e sem chamar ninguém. Só o que depende de fora do motor é
 * imitado, e a tela diz que é imitação:
 *   - WebHook: quem testa escolhe "Deu certo" ou "Falhou";
 *   - Agendar horário: horários DE EXEMPLO, e nada é marcado na Agenda;
 *   - Acionar outro fluxo: só "voltar ao início" deste fluxo roda; outro fluxo
 *     é anunciado e o teste para ali;
 *   - relógio ("Aguardar", mensagem de espera): botão para pular.
 */
import {
  continuarAposMarcar,
  continuarAposWebhook,
  continuarComHorarios,
  continuarFluxo,
  iniciarFluxo,
  inicioParaAcionar,
  inicioPorAutomacao,
  normalizar,
  proximaMensagemDeEspera,
  retomarFluxo,
  seguirAoResponder,
  type ContextoDoTurno,
  type Efeito,
  type OfertaDeHorario,
  type ResultadoDoTurno,
  type SessaoDoChatbot,
} from "./motor";
import { lerConfig, type Grafo, type TipoDeMidia } from "./passos";
import { contatoVazio, type ContatoDoTurno } from "./regras";
import { rotuloLocal } from "@/lib/tempo/agora";

/** O que acontece no teste além das mensagens — a tela dá o texto de cada um. */
export type EventoDoTeste =
  | { tipo: "transferiu_equipe" }
  | { tipo: "transferiu_atendente"; user_id: string | null }
  | { tipo: "etiquetas"; adicionar: string[]; remover: string[] }
  | { tipo: "nota"; texto: string }
  | { tipo: "campo"; campo: string; valor: string }
  | { tipo: "avaliacao"; nota: number }
  | { tipo: "feedback" }
  | { tipo: "followup"; pointer_id: string }
  | { tipo: "aviso"; texto: string }
  | { tipo: "negocio"; stage_id: string }
  | { tipo: "finalizou" }
  | { tipo: "horarios_de_exemplo" }
  | { tipo: "marcou_de_exemplo" }
  | { tipo: "abriria_fluxo"; flow_id: string }
  | { tipo: "voltou_ao_inicio" }
  /** A mensagem não começaria o fluxo (falta a palavra-chave). */
  | { tipo: "nao_comecaria" }
  /** Mensagem durante uma espera que diz "continuar esperando". */
  | { tipo: "espera_mantida" }
  | { tipo: "ja_terminou" }
  | { tipo: "limite" };

export type BolhaDoTeste =
  | { de: "bot"; texto: string }
  | { de: "midia"; tipo: TipoDeMidia; legenda: string; storage_path: string }
  | { de: "contato"; texto: string }
  | { de: "evento"; evento: EventoDoTeste };

/** Do que o teste está esperando agora. */
export type EsperaDoTeste =
  /** Mensagem do contato (a primeira, ou a resposta de uma pergunta). */
  | { tipo: "mensagem" }
  /** Fluxo de "Iniciar por automação": um botão começa. */
  | { tipo: "comecar" }
  | { tipo: "relogio"; ate: string }
  | { tipo: "webhook" }
  /** Transferido com mensagem de espera armada. */
  | { tipo: "espera_da_equipe"; ate: string }
  | { tipo: "fim" };

export type EstadoDoTeste = {
  sessao: SessaoDoChatbot | null;
  contato: ContatoDoTurno;
  bolhas: BolhaDoTeste[];
  espera: EsperaDoTeste;
  /** Onde o fluxo parou (para o quadro destacar o passo). */
  noAtual: string | null;
};

export type OpcoesDoTeste = { fluxoAtual: string; fuso: string; agora?: () => Date };

const LIMITE_DE_IDAS = 8;

function ctxDe(estado: EstadoDoTeste, mensagem: string | null, o: OpcoesDoTeste): ContextoDoTurno {
  return { mensagem, agora: o.agora?.() ?? new Date(), fuso: o.fuso, contato: estado.contato };
}

/** Começo do teste: o fluxo de canal espera a primeira mensagem; o de automação, o botão. */
export function comecarTeste(grafo: Grafo): EstadoDoTeste {
  const porCanal = grafo.nodes.some((n) => n.type === "inicio_canal");
  return {
    sessao: null,
    contato: contatoVazio(),
    bolhas: [],
    espera: porCanal ? { tipo: "mensagem" } : { tipo: "comecar" },
    noAtual: null,
  };
}

/** O início de canal que esta primeira mensagem dispara (ignora o número: no teste não há número). */
function inicioDoCanal(grafo: Grafo, mensagem: string): string | null {
  for (const no of grafo.nodes) {
    if (no.type !== "inicio_canal") continue;
    const c = lerConfig("inicio_canal", no.data);
    if (c.gatilho === "palavra_chave") {
      const m = normalizar(mensagem);
      if (!m || !c.palavras.some((p) => m.includes(normalizar(p)))) continue;
    }
    return no.id;
  }
  return null;
}

export function enviarNoTeste(
  grafo: Grafo,
  estado: EstadoDoTeste,
  texto: string,
  o: OpcoesDoTeste,
): EstadoDoTeste {
  const base: EstadoDoTeste = { ...estado, bolhas: [...estado.bolhas, { de: "contato", texto }] };
  const ctx = ctxDe(base, texto, o);
  const s = estado.sessao;
  if (!s) {
    const inicio = inicioDoCanal(grafo, texto);
    if (!inicio) return comEvento(base, { tipo: "nao_comecaria" });
    return aplicar(grafo, base, iniciarFluxo(grafo, inicio, ctx), ctx, o);
  }
  if (s.status === "waiting_input") return aplicar(grafo, base, continuarFluxo(grafo, s, ctx), ctx, o);
  if (s.status === "waiting_timer") {
    if (!seguirAoResponder(grafo, s.no_atual)) return comEvento(base, { tipo: "espera_mantida" });
    return aplicar(grafo, base, retomarFluxo(grafo, s, ctx), ctx, o);
  }
  return comEvento(base, { tipo: "ja_terminou" });
}

/** Fluxo de "Iniciar por automação": como se a regra tivesse mandado. */
export function comecarPorAutomacao(grafo: Grafo, estado: EstadoDoTeste, o: OpcoesDoTeste): EstadoDoTeste {
  const inicio = inicioPorAutomacao(grafo);
  if (!inicio) return comEvento(estado, { tipo: "ja_terminou" });
  const ctx = ctxDe(estado, null, o);
  return aplicar(grafo, estado, iniciarFluxo(grafo, inicio, ctx), ctx, o);
}

/** "Pular espera": o relógio do "Aguardar" venceu. */
export function pularEspera(grafo: Grafo, estado: EstadoDoTeste, o: OpcoesDoTeste): EstadoDoTeste {
  if (!estado.sessao) return estado;
  const ctx = ctxDe(estado, null, o);
  if (estado.sessao.status === "transferred") {
    const p = proximaMensagemDeEspera(grafo, estado.sessao, ctx.agora);
    if (!p) return { ...estado, espera: { tipo: "fim" } };
    return depoisDoTurno(
      { ...estado, bolhas: [...estado.bolhas, { de: "bot", texto: p.texto }] },
      p.sessao,
    );
  }
  return aplicar(grafo, estado, retomarFluxo(grafo, estado.sessao, ctx), ctx, o);
}

/** O WebHook do teste: quem testa escolhe o desfecho. */
export function responderWebhookNoTeste(
  grafo: Grafo,
  estado: EstadoDoTeste,
  deuCerto: boolean,
  o: OpcoesDoTeste,
): EstadoDoTeste {
  if (!estado.sessao) return estado;
  const ctx = ctxDe(estado, null, o);
  return aplicar(
    grafo,
    estado,
    continuarAposWebhook(grafo, estado.sessao, { ok: deuCerto, status: deuCerto ? 200 : 500, corpo: {} }, ctx),
    ctx,
    o,
  );
}

/** Horários de exemplo: dias úteis seguintes, de manhã e de tarde, no fuso da empresa. */
export function horariosDeExemplo(agora: Date, fuso: string, quantidade: number): OfertaDeHorario[] {
  const saida: OfertaDeHorario[] = [];
  const horas = [9, 10, 14, 16];
  for (let d = 1; saida.length < quantidade && d < 30; d++) {
    const dia = new Date(agora.getTime() + d * 86_400_000);
    const semana = dia.getUTCDay();
    if (semana === 0 || semana === 6) continue;
    for (const h of horas) {
      if (saida.length >= quantidade) break;
      // 12h UTC do dia + a diferença até a hora pedida: o rótulo sai no fuso da empresa.
      const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), h + 3, 0));
      saida.push({ inicio: inicio.toISOString(), quando: rotuloLocal(inicio, fuso) });
    }
  }
  return saida;
}

function comEvento(estado: EstadoDoTeste, evento: EventoDoTeste): EstadoDoTeste {
  return { ...estado, bolhas: [...estado.bolhas, { de: "evento", evento }] };
}

function depoisDoTurno(estado: EstadoDoTeste, sessao: SessaoDoChatbot): EstadoDoTeste {
  const espera: EsperaDoTeste =
    sessao.status === "waiting_input"
      ? { tipo: "mensagem" }
      : sessao.status === "waiting_timer" && sessao.retomar_em
        ? { tipo: "relogio", ate: sessao.retomar_em }
        : sessao.status === "transferred" && sessao.retomar_em
          ? { tipo: "espera_da_equipe", ate: sessao.retomar_em }
          : { tipo: "fim" };
  return { ...estado, sessao, espera, noAtual: sessao.no_atual };
}

/** Os efeitos viram bolhas; o que vem de fora do motor é imitado. */
function aplicar(
  grafo: Grafo,
  inicial: EstadoDoTeste,
  primeiro: ResultadoDoTurno,
  ctx: ContextoDoTurno,
  o: OpcoesDoTeste,
): EstadoDoTeste {
  let estado = inicial;
  let r = primeiro;
  for (let idas = 0; ; idas++) {
    estado = comEfeitos(estado, r.efeitos);
    const p = r.pendente;
    if (!p) return depoisDoTurno(estado, r.sessao);
    if (idas >= LIMITE_DE_IDAS) {
      return { ...comEvento(estado, { tipo: "limite" }), sessao: null, espera: { tipo: "fim" }, noAtual: null };
    }
    const c: ContextoDoTurno = { ...ctx, contato: estado.contato };
    switch (p.tipo) {
      case "webhook":
        return { ...estado, sessao: r.sessao, espera: { tipo: "webhook" }, noAtual: p.no };
      case "horarios": {
        const no = grafo.nodes.find((n) => n.id === p.no);
        const qtd = no ? lerConfig("agendar_horario", no.data).quantidade : 3;
        estado = comEvento(estado, { tipo: "horarios_de_exemplo" });
        r = continuarComHorarios(grafo, r.sessao, horariosDeExemplo(c.agora, o.fuso, qtd), c);
        break;
      }
      case "marcar":
        estado = comEvento(estado, { tipo: "marcou_de_exemplo" });
        r = continuarAposMarcar(grafo, r.sessao, { ok: true, aguardaConfirmacao: false }, c);
        break;
      case "fluxo": {
        const inicio = p.flow_id === o.fluxoAtual ? inicioParaAcionar(grafo) : null;
        if (!inicio) {
          return {
            ...comEvento(estado, { tipo: "abriria_fluxo", flow_id: p.flow_id }),
            sessao: r.sessao,
            espera: { tipo: "fim" },
            noAtual: p.no,
          };
        }
        estado = comEvento(estado, { tipo: "voltou_ao_inicio" });
        const dados = Object.fromEntries(Object.entries(r.sessao.dados).filter(([k]) => !k.startsWith("_")));
        r = iniciarFluxo(grafo, inicio, c, dados);
        break;
      }
    }
  }
}

function comEfeitos(estado: EstadoDoTeste, efeitos: Efeito[]): EstadoDoTeste {
  const bolhas = [...estado.bolhas];
  const contato: ContatoDoTurno = {
    ...estado.contato,
    tags: [...estado.contato.tags],
    personalizados: { ...estado.contato.personalizados },
  };
  for (const e of efeitos) {
    switch (e.tipo) {
      case "enviar":
        bolhas.push({ de: "bot", texto: e.texto });
        break;
      case "midia":
        bolhas.push({ de: "midia", tipo: e.midia, legenda: e.legenda, storage_path: e.storage_path });
        break;
      case "transferir_equipe":
        bolhas.push({ de: "evento", evento: { tipo: "transferiu_equipe" } });
        break;
      case "transferir_atendente":
        bolhas.push({ de: "evento", evento: { tipo: "transferiu_atendente", user_id: e.user_id } });
        break;
      case "etiquetas": {
        const sai = new Set(e.remover.map(normalizar));
        contato.tags = contato.tags.filter((t) => !sai.has(normalizar(t)));
        for (const t of e.adicionar) if (!contato.tags.some((x) => normalizar(x) === normalizar(t))) contato.tags.push(t);
        bolhas.push({ de: "evento", evento: { tipo: "etiquetas", adicionar: e.adicionar, remover: e.remover } });
        break;
      }
      case "nota":
        bolhas.push({ de: "evento", evento: { tipo: "nota", texto: e.texto } });
        break;
      case "campo_contato":
        if (e.campo === "personalizado") contato.personalizados[e.chave] = e.valor;
        else contato[e.campo] = e.valor;
        bolhas.push({
          de: "evento",
          evento: { tipo: "campo", campo: e.campo === "personalizado" ? e.chave : e.campo, valor: e.valor },
        });
        break;
      case "avaliacao":
        bolhas.push({ de: "evento", evento: { tipo: "avaliacao", nota: e.nota } });
        break;
      case "feedback":
        bolhas.push({ de: "evento", evento: { tipo: "feedback" } });
        break;
      case "followup":
        bolhas.push({ de: "evento", evento: { tipo: "followup", pointer_id: e.pointer_id } });
        break;
      case "notificar":
        bolhas.push({ de: "evento", evento: { tipo: "aviso", texto: e.modelo } });
        break;
      case "negocio":
        bolhas.push({ de: "evento", evento: { tipo: "negocio", stage_id: e.stage_id } });
        break;
      case "finalizar":
        bolhas.push({ de: "evento", evento: { tipo: "finalizou" } });
        break;
    }
  }
  return { ...estado, bolhas, contato };
}
