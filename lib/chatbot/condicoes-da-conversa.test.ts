import { describe, expect, it } from "vitest";

import { fatosVazios, iniciarFluxo, inicioManual, type ContextoDoTurno, type FatosDaConversa } from "./motor";
import { saidasDoPasso, type Grafo } from "./passos";
import { comecarPorAutomacao, comecarTeste, enviarNoTeste, mudarSituacao } from "./simulador";
import { contatoVazio } from "./regras";
import { problemasDoGrafo } from "./validar";

const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle: string | null = "proximo") => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  target,
  sourceHandle,
});
const AGORA = "2026-10-23T15:00:00Z";
const CANAL = "77777777-7777-4777-8777-777777777777";
const ANA = "88888888-8888-4888-8888-888888888888";
const BIA = "99999999-9999-4999-8999-999999999999";
const ctx = (conversa: Partial<FatosDaConversa> = {}, extra: Partial<ContextoDoTurno> = {}): ContextoDoTurno => ({
  mensagem: "oi",
  agora: new Date(AGORA),
  fuso: "America/Sao_Paulo",
  conversa: { ...fatosVazios(), ...conversa },
  ...extra,
});

/** Desenho de uma condição só: "sim" → manda "S", "nao" → manda "N". Devolve o texto que saiu. */
function decide(tipo: string, data: Record<string, unknown>, c: ContextoDoTurno): string | undefined {
  const g: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("c", tipo, data),
      no("s", "enviar_mensagem", { texto: "S" }),
      no("n", "enviar_mensagem", { texto: "N" }),
    ],
    edges: [liga("ini", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
  };
  const r = iniciarFluxo(g, "ini", c);
  return r.efeitos.find((e) => e.tipo === "enviar")?.texto as string | undefined;
}

describe("Condições da conversa (como na Umbler)", () => {
  it("O contato está ativo? — mensagem dentro da janela", () => {
    const ha2h = new Date(Date.parse(AGORA) - 2 * 3_600_000).toISOString();
    const ha30h = new Date(Date.parse(AGORA) - 30 * 3_600_000).toISOString();
    expect(decide("contato_ativo", {}, ctx({ ultima_entrada_em: ha2h }))).toBe("S");
    expect(decide("contato_ativo", {}, ctx({ ultima_entrada_em: ha30h }))).toBe("N");
    expect(decide("contato_ativo", { horas: 48 }, ctx({ ultima_entrada_em: ha30h }))).toBe("S");
    expect(decide("contato_ativo", {}, ctx())).toBe("N");
  });

  it("Etiquetas — alguma ou todas, sem diferença de maiúscula e acento", () => {
    const comTags = (tags: string[]) => ctx({}, { contato: { ...contatoVazio(), tags } });
    expect(decide("tem_etiqueta", { etiquetas: ["VIP", "Clínica"] }, comTags(["clinica"]))).toBe("S");
    expect(decide("tem_etiqueta", { etiquetas: ["VIP", "Clínica"], modo: "todas" }, comTags(["clinica"]))).toBe("N");
    expect(decide("tem_etiqueta", { etiquetas: ["VIP", "Clínica"], modo: "todas" }, comTags(["vip", "clinica"]))).toBe("S");
  });

  it("Primeira conversa, Presença, Bot paralelo e Status da conversa leem os fatos do executor", () => {
    expect(decide("primeira_conversa", {}, ctx({ primeira_conversa: true }))).toBe("S");
    expect(decide("primeira_conversa", {}, ctx())).toBe("N");
    expect(decide("presenca_do_atendente", {}, ctx({ equipe_disponivel: true }))).toBe("S");
    expect(decide("presenca_do_atendente", {}, ctx())).toBe("N");
    expect(decide("bot_paralelo", {}, ctx({ outro_bot: true }))).toBe("S");
    expect(decide("status_da_conversa", {}, ctx({ aguardando_resposta: true }))).toBe("S");
    expect(decide("status_da_conversa", {}, ctx())).toBe("N");
  });

  it("Canal e Atendente da conversa", () => {
    expect(decide("canal_da_conversa", { canais: [CANAL] }, ctx({ canal: CANAL }))).toBe("S");
    expect(decide("canal_da_conversa", { canais: [CANAL] }, ctx({ canal: null }))).toBe("N");
    expect(decide("atendente_da_conversa", { atendentes: [ANA] }, ctx({ atendente: ANA }))).toBe("S");
    expect(decide("atendente_da_conversa", { atendentes: [ANA] }, ctx({ atendente: BIA }))).toBe("N");
    // Sem ninguém marcado: qualquer atendente vale; sem atendente, não.
    expect(decide("atendente_da_conversa", {}, ctx({ atendente: BIA }))).toBe("S");
    expect(decide("atendente_da_conversa", {}, ctx())).toBe("N");
  });

  it("sem fatos (o teste antigo, ou a leitura falhou), as condições seguem por 'não'", () => {
    expect(decide("primeira_conversa", {}, { mensagem: "oi", agora: new Date(AGORA), fuso: "America/Sao_Paulo" })).toBe("N");
  });
});

describe("Distribuir fluxo", () => {
  const g: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("d", "distribuir_fluxo", { saidas: [{ rotulo: "Curta", peso: 70 }, { rotulo: "Longa", peso: 30 }] }),
      no("a", "enviar_mensagem", { texto: "A" }),
      no("b", "enviar_mensagem", { texto: "B" }),
    ],
    edges: [liga("ini", "d"), liga("d", "a", "saida-0"), liga("d", "b", "saida-1")],
  };
  const sai = (sorteio: number) =>
    iniciarFluxo(g, "ini", ctx({}, { sorteio: () => sorteio })).efeitos.find((e) => e.tipo === "enviar")?.texto;

  it("sorteia pelo peso", () => {
    expect(sai(0)).toBe("A");
    expect(sai(0.69)).toBe("A");
    expect(sai(0.71)).toBe("B");
    expect(sai(0.9999)).toBe("B");
  });

  it("as saídas mostram o nome e a porcentagem", () => {
    expect(saidasDoPasso("distribuir_fluxo", g.nodes[1]!.data)).toEqual([
      { id: "saida-0", rotulo: "Curta · 70%" },
      { id: "saida-1", rotulo: "Longa · 30%" },
    ]);
  });
});

describe("Bloquear e Excluir contato", () => {
  it("bloquear: a mensagem sai antes, depois bloqueia e finaliza; o fluxo termina", () => {
    const g: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("b", "bloquear_contato", { mensagem: "Tchau." })],
      edges: [liga("ini", "b")],
    };
    const r = iniciarFluxo(g, "ini", ctx());
    expect(r.efeitos.map((e) => e.tipo)).toEqual(["enviar", "bloquear", "finalizar"]);
    expect(r.sessao.status).toBe("completed");
    expect(saidasDoPasso("bloquear_contato", {})).toEqual([]);
  });

  it("excluir: avisa o contato, abre o pedido e o fluxo segue", () => {
    const g: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("x", "excluir_contato"), no("fim", "finalizar_conversa")],
      edges: [liga("ini", "x"), liga("x", "fim")],
    };
    const r = iniciarFluxo(g, "ini", ctx());
    expect(r.efeitos.map((e) => e.tipo)).toEqual(["enviar", "pedido_exclusao", "finalizar"]);
  });
});

describe("Iniciar manualmente", () => {
  const g: Grafo = {
    nodes: [no("m", "inicio_manual"), no("p", "pedir_avaliacao")],
    edges: [liga("m", "p")],
  };

  it("é um início válido, que só o atendente aciona", () => {
    expect(inicioManual(g)).toBe("m");
    expect(problemasDoGrafo(g)).toEqual([]);
    expect(problemasDoGrafo({ nodes: [no("m", "inicio_manual")], edges: [] })).toContain(
      'ligue o "Iniciar manualmente" ao primeiro passo do fluxo.',
    );
  });

  it("no teste, começa pelo botão e roda o fluxo", () => {
    const e = comecarTeste(g);
    expect(e.espera).toEqual({ tipo: "comecar" });
    const depois = comecarPorAutomacao(g, e, { fluxoAtual: "x", fuso: "America/Sao_Paulo" });
    expect(depois.bolhas[0]).toEqual({ de: "bot", texto: "De 1 a 5, que nota você dá para o nosso atendimento?" });
  });
});

describe("Situação do teste", () => {
  it("quem testa escolhe a resposta das condições da conversa", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("c", "presenca_do_atendente"),
        no("s", "enviar_mensagem", { texto: "Já te passo para a equipe." }),
        no("n", "enviar_mensagem", { texto: "Nosso horário é das 8h às 18h." }),
      ],
      edges: [liga("ini", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
    };
    const o = { fluxoAtual: "x", fuso: "America/Sao_Paulo" };
    expect(enviarNoTeste(g, comecarTeste(g), "oi", o).bolhas.at(-1)).toEqual({
      de: "bot",
      texto: "Já te passo para a equipe.",
    });
    const semNinguem = mudarSituacao(comecarTeste(g), { equipe_disponivel: false });
    expect(enviarNoTeste(g, semNinguem, "oi", o).bolhas.at(-1)).toEqual({
      de: "bot",
      texto: "Nosso horário é das 8h às 18h.",
    });
  });
});
