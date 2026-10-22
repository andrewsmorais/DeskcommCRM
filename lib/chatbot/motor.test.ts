import { describe, expect, it } from "vitest";
import {
  LIMITE_DE_PASSOS,
  continuarFluxo,
  dentroDasFaixas,
  iniciarFluxo,
  opcaoEscolhida,
  pontoDePartida,
  type ContextoDoTurno,
} from "./motor";
import type { Grafo } from "./passos";

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
// Quarta-feira, 22/10/2026, 10:30 em São Paulo (13:30 UTC).
const ctx = (mensagem: string | null, iso = "2026-10-22T13:30:00Z"): ContextoDoTurno => ({
  mensagem,
  agora: new Date(iso),
  fuso: "America/Sao_Paulo",
});

/** Menu de atendimento típico: boas-vindas → escolher → vendas (setor) | suporte (pergunta nome) | fim. */
const menu: Grafo = {
  nodes: [
    no("ini", "inicio_canal"),
    no("oi", "enviar_mensagem", { texto: "Olá! Bem-vindo à Loja." }),
    no("menu", "pedir_escolher", {
      pergunta: "Como posso ajudar?",
      opcoes: ["Comprar", "Suporte"],
      tentativas: 2,
    }),
    no("vendas", "transferir_equipe", { mensagem: "Vou te passar para vendas." }),
    no("nome", "pedir_digitar", { pergunta: "Qual o seu nome?", variavel: "nome" }),
    no("obrigado", "enviar_mensagem", { texto: "Obrigado, {{nome}}!" }),
    no("tchau", "finalizar_conversa", { mensagem: "Até logo." }),
    no("nota", "bloco_de_notas", { texto: "lembrete" }),
  ],
  edges: [
    liga("ini", "oi"),
    liga("oi", "menu"),
    liga("menu", "vendas", "opcao-0"),
    liga("menu", "nome", "opcao-1"),
    liga("menu", "tchau", "invalida"),
    liga("nome", "obrigado"),
    liga("obrigado", "tchau"),
  ],
};

describe("começar o fluxo", () => {
  it("manda as boas-vindas e o menu numerado, e para esperando a escolha", () => {
    const r = iniciarFluxo(menu, "ini", ctx("oi"));
    expect(r.efeitos).toEqual([
      { tipo: "enviar", texto: "Olá! Bem-vindo à Loja." },
      { tipo: "enviar", texto: "Como posso ajudar?\n\n1. Comprar\n2. Suporte" },
    ]);
    expect(r.sessao).toMatchObject({ status: "waiting_input", no_atual: "menu" });
  });

  it("início por palavra-chave só começa quando a mensagem tem a palavra", () => {
    const g: Grafo = {
      nodes: [no("ini", "inicio_canal", { gatilho: "palavra_chave", palavras: ["Promoção"] })],
      edges: [],
    };
    expect(pontoDePartida(g, { channelSessionId: null, mensagem: "oi" })).toBeNull();
    expect(pontoDePartida(g, { channelSessionId: null, mensagem: "quero a PROMOCAO" })).toBe("ini");
  });

  it("início preso a um número só responde naquele número", () => {
    const canal = "22222222-2222-4222-8222-222222222222";
    const g: Grafo = {
      nodes: [no("ini", "inicio_canal", { channel_session_id: canal })],
      edges: [],
    };
    expect(
      pontoDePartida(g, {
        channelSessionId: "33333333-3333-4333-8333-333333333333",
        mensagem: "oi",
      }),
    ).toBeNull();
    expect(pontoDePartida(g, { channelSessionId: canal, mensagem: "oi" })).toBe("ini");
  });

  it("desenho sem passo de início não começa", () => {
    expect(
      pontoDePartida(
        { nodes: [no("x", "enviar_mensagem")], edges: [] },
        { channelSessionId: null, mensagem: "oi" },
      ),
    ).toBeNull();
  });
});

describe("pedir para escolher", () => {
  const parado = iniciarFluxo(menu, "ini", ctx("oi")).sessao;

  it("aceita o número, o número com ponto e o texto da opção sem acento", () => {
    expect(opcaoEscolhida("2", ["Comprar", "Suporte"])).toBe(1);
    expect(opcaoEscolhida("1.", ["Comprar", "Suporte"])).toBe(0);
    expect(opcaoEscolhida("  suporte ", ["Comprar", "Suporte"])).toBe(1);
    expect(opcaoEscolhida("3", ["Comprar", "Suporte"])).toBeNull();
  });

  it("escolha 1 passa para a equipe com a mensagem", () => {
    const r = continuarFluxo(menu, parado, ctx("1"));
    expect(r.efeitos).toEqual([
      { tipo: "enviar", texto: "Vou te passar para vendas." },
      { tipo: "transferir_equipe" },
    ]);
    expect(r.sessao.status).toBe("transferred");
  });

  it("resposta inválida repete o menu; esgotadas as tentativas segue a saída de inválida", () => {
    const r1 = continuarFluxo(menu, parado, ctx("banana"));
    expect(r1.sessao).toMatchObject({ status: "waiting_input", no_atual: "menu", tentativas: 1 });
    expect(r1.efeitos[0]?.tipo).toBe("enviar");
    const r2 = continuarFluxo(menu, r1.sessao, ctx("de novo banana"));
    expect(r2.efeitos).toEqual([{ tipo: "enviar", texto: "Até logo." }, { tipo: "finalizar" }]);
    expect(r2.sessao.status).toBe("completed");
  });
});

describe("pedir para digitar e variáveis", () => {
  it("guarda a resposta e usa {{nome}} na mensagem seguinte", () => {
    const parado = iniciarFluxo(menu, "ini", ctx("oi")).sessao;
    const pediuNome = continuarFluxo(menu, parado, ctx("2"));
    expect(pediuNome.efeitos).toEqual([{ tipo: "enviar", texto: "Qual o seu nome?" }]);
    const fim = continuarFluxo(menu, pediuNome.sessao, ctx("Ana"));
    expect(fim.efeitos).toEqual([
      { tipo: "enviar", texto: "Obrigado, Ana!" },
      { tipo: "enviar", texto: "Até logo." },
      { tipo: "finalizar" },
    ]);
  });
});

describe("condições", () => {
  const condicao = (
    tipo: string,
    data: Record<string, unknown>,
    saidas: [string, string],
  ): Grafo => ({
    nodes: [
      no("ini", "inicio_canal"),
      no("c", tipo, data),
      no("a", "enviar_mensagem", { texto: "A" }),
      no("b", "enviar_mensagem", { texto: "B" }),
    ],
    edges: [liga("ini", "c"), liga("c", "a", saidas[0]), liga("c", "b", saidas[1])],
  });
  const enviado = (g: Grafo, c: ContextoDoTurno) =>
    iniciarFluxo(g, "ini", c).efeitos.map((e) => (e.tipo === "enviar" ? e.texto : e.tipo));

  it("horários usa o fuso da empresa", () => {
    const g = condicao("horarios", { faixas: [{ inicio: "08:00", fim: "18:00" }] }, [
      "dentro",
      "fora",
    ]);
    expect(enviado(g, ctx("oi", "2026-10-22T13:30:00Z"))).toEqual(["A"]); // 10:30 em SP
    expect(enviado(g, ctx("oi", "2026-10-22T23:30:00Z"))).toEqual(["B"]); // 20:30 em SP
  });

  it("faixa que passa da meia-noite", () => {
    expect(dentroDasFaixas(23 * 60, [{ inicio: "22:00", fim: "06:00" }])).toBe(true);
    expect(dentroDasFaixas(5 * 60, [{ inicio: "22:00", fim: "06:00" }])).toBe(true);
    expect(dentroDasFaixas(12 * 60, [{ inicio: "22:00", fim: "06:00" }])).toBe(false);
  });

  it("dias da semana no fuso da empresa (quarta = 3)", () => {
    const g = condicao("dias_semana", { dias: [1, 2, 3, 4, 5] }, ["sim", "nao"]);
    expect(enviado(g, ctx("oi"))).toEqual(["A"]);
    const fimDeSemana = condicao("dias_semana", { dias: [0, 6] }, ["sim", "nao"]);
    expect(enviado(fimDeSemana, ctx("oi"))).toEqual(["B"]);
  });

  it("mensagem contém ignora acento e maiúscula", () => {
    const g = condicao("mensagem_contem", { palavras: ["preço"] }, ["sim", "nao"]);
    expect(enviado(g, ctx("Qual o PRECO?"))).toEqual(["A"]);
    expect(enviado(g, ctx("bom dia"))).toEqual(["B"]);
    expect(enviado(g, ctx(null))).toEqual(["B"]);
  });
});

describe("segurança do motor", () => {
  it("desenho em círculo sem pergunta para no limite de passos", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("a", "enviar_mensagem", { texto: "x" }),
        no("b", "enviar_mensagem", { texto: "y" }),
      ],
      edges: [liga("ini", "a"), liga("a", "b"), liga("b", "a")],
    };
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    expect(r.passos).toBe(LIMITE_DE_PASSOS);
    expect(r.sessao.status).toBe("completed");
  });

  it("passo apagado enquanto a conversa esperava encerra sem erro", () => {
    const r = continuarFluxo(
      { nodes: [], edges: [] },
      { no_atual: "sumiu", status: "waiting_input", tentativas: 0, dados: {} },
      ctx("1"),
    );
    expect(r).toMatchObject({ efeitos: [], sessao: { status: "completed" } });
  });

  it("passo sem ligação de saída termina o fluxo", () => {
    const g: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("a", "enviar_mensagem", { texto: "só isso" })],
      edges: [liga("ini", "a")],
    };
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    expect(r.efeitos).toEqual([{ tipo: "enviar", texto: "só isso" }]);
    expect(r.sessao.status).toBe("completed");
  });
});
