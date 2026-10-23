import { describe, expect, it } from "vitest";

import {
  continuarFluxo,
  iniciarFluxo,
  retomarFluxo,
  seguirAoResponder,
  type ContextoDoTurno,
} from "./motor";
import { lerConfig, saidasDoPasso, type Grafo } from "./passos";
import { notaDaResposta, regraVale, contatoVazio, problemaDaRegra } from "./regras";
import { fimDoIntervalo, proximoHorario, ESPERA_MAXIMA_MS } from "./relogio";

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
const AGORA = "2026-10-22T13:30:00Z";
const ctx = (mensagem: string | null, iso = AGORA): ContextoDoTurno => ({
  mensagem,
  agora: new Date(iso),
  fuso: "America/Sao_Paulo",
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

describe("Pedir para avaliar + Pedir feedback escrito", () => {
  const pesquisa: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("nota", "pedir_avaliacao", { tentativas: 2 }),
      no("se", "definir_condicao", {
        regra: { fonte: "variavel", chave: "avaliacao", operador: "maior_ou_igual", valor: "4" },
      }),
      no("valeu", "enviar_mensagem", { texto: "Que bom! Nota {{avaliacao}}." }),
      no("porque", "pedir_feedback", { pergunta: "O que podemos melhorar?" }),
      no("fim", "enviar_mensagem", { texto: "Obrigado pelo retorno." }),
    ],
    edges: [
      liga("ini", "nota"),
      liga("nota", "se", "proximo"),
      liga("se", "valeu", "sim"),
      liga("se", "porque", "nao"),
      liga("porque", "fim"),
    ],
  };

  it("pergunta a nota e espera", () => {
    const r = iniciarFluxo(pesquisa, "ini", ctx("oi"));
    expect(textos(r.efeitos)).toEqual(["De 1 a 5, que nota você dá para o nosso atendimento?"]);
    expect(r.sessao).toMatchObject({ status: "waiting_input", no_atual: "nota" });
  });

  it("nota alta: grava a avaliação e segue pela regra 'nota ≥ 4'", () => {
    const parado = iniciarFluxo(pesquisa, "ini", ctx("oi")).sessao;
    const r = continuarFluxo(pesquisa, parado, ctx("nota 5!"));
    expect(r.efeitos).toContainEqual({ tipo: "avaliacao", nota: 5, escala: "1_5" });
    expect(textos(r.efeitos)).toEqual(["Que bom! Nota 5."]);
  });

  it("nota baixa: pede o comentário, e o comentário vira feedback", () => {
    const parado = iniciarFluxo(pesquisa, "ini", ctx("oi")).sessao;
    const r1 = continuarFluxo(pesquisa, parado, ctx("⭐⭐"));
    expect(r1.efeitos).toContainEqual({ tipo: "avaliacao", nota: 2, escala: "1_5" });
    expect(textos(r1.efeitos)).toEqual(["O que podemos melhorar?"]);
    const r2 = continuarFluxo(pesquisa, r1.sessao, ctx("Demorou muito"));
    expect(r2.efeitos).toEqual([
      { tipo: "feedback", texto: "Demorou muito" },
      { tipo: "enviar", texto: "Obrigado pelo retorno." },
    ]);
  });

  it("resposta fora da escala: avisa, e depois das tentativas segue por 'Não avaliou'", () => {
    const g: Grafo = {
      ...pesquisa,
      nodes: [...pesquisa.nodes, no("sem", "enviar_mensagem", { texto: "Tudo bem!" })],
      edges: [...pesquisa.edges, liga("nota", "sem", "invalida")],
    };
    const parado = iniciarFluxo(g, "ini", ctx("oi")).sessao;
    const r1 = continuarFluxo(g, parado, ctx("9"));
    expect(textos(r1.efeitos)).toEqual(["Não entendi. Responda só com o número da nota."]);
    expect(r1.sessao.status).toBe("waiting_input");
    const r2 = continuarFluxo(g, r1.sessao, ctx("sei lá"));
    expect(r2.efeitos.some((e) => e.tipo === "avaliacao")).toBe(false);
    expect(textos(r2.efeitos)).toEqual(["Tudo bem!"]);
  });

  it("lê a nota do jeito que as pessoas respondem", () => {
    expect(notaDaResposta("5", "1_5")).toBe(5);
    expect(notaDaResposta("dou 4", "1_5")).toBe(4);
    expect(notaDaResposta("★★★", "1_5")).toBe(3);
    expect(notaDaResposta("0", "1_5")).toBeNull();
    expect(notaDaResposta("0", "0_10")).toBe(0);
    expect(notaDaResposta("10", "0_10")).toBe(10);
    expect(notaDaResposta("11", "0_10")).toBeNull();
    expect(notaDaResposta("ótimo", "1_5")).toBeNull();
  });

  it("as saídas do passo no quadro", () => {
    expect(saidasDoPasso("pedir_avaliacao", {}).map((s) => s.id)).toEqual(["proximo", "invalida"]);
  });
});

describe("comparação de número nas regras", () => {
  const vale = (operador: "maior_ou_igual" | "menor_ou_igual", valor: string, resposta: string) =>
    regraVale(
      { fonte: "variavel", chave: "x", operador, valor, rotulo: "" },
      { mensagem: null, dados: { x: resposta }, contato: contatoVazio() },
    );
  it("compara número, aceita vírgula, e texto sem número nunca vale", () => {
    expect(vale("maior_ou_igual", "4", "4")).toBe(true);
    expect(vale("maior_ou_igual", "4", "3,5")).toBe(false);
    expect(vale("menor_ou_igual", "6", "6")).toBe(true);
    expect(vale("menor_ou_igual", "6", "ótimo")).toBe(false);
  });
  it("valor que não é número impede ligar o fluxo", () => {
    expect(
      problemaDaRegra({ fonte: "variavel", chave: "x", operador: "maior_ou_igual", valor: "quatro", rotulo: "" }),
    ).toBe("escreva um número para comparar");
  });
});

describe("Aguardar intervalo / Aguardar até", () => {
  const lembrete: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("oi", "enviar_mensagem", { texto: "Já te respondo." }),
      no("espera", "aguardar_intervalo", { quantidade: 2, unidade: "horas" }),
      no("volta", "enviar_mensagem", { texto: "Conseguiu ver?" }),
    ],
    edges: [liga("ini", "oi"), liga("oi", "espera"), liga("espera", "volta")],
  };

  it("para no relógio e diz quando volta", () => {
    const r = iniciarFluxo(lembrete, "ini", ctx("oi"));
    expect(textos(r.efeitos)).toEqual(["Já te respondo."]);
    expect(r.sessao).toMatchObject({
      status: "waiting_timer",
      no_atual: "espera",
      retomar_em: "2026-10-22T15:30:00.000Z",
    });
  });

  it("quando o relógio vence, segue pela saída da espera", () => {
    const parado = iniciarFluxo(lembrete, "ini", ctx("oi")).sessao;
    const r = retomarFluxo(lembrete, parado, ctx(null, "2026-10-22T15:30:05Z"));
    expect(textos(r.efeitos)).toEqual(["Conseguiu ver?"]);
    expect(r.sessao).toMatchObject({ status: "completed", retomar_em: null });
  });

  it("espera sem ligação de saída: retomar só encerra", () => {
    const g: Grafo = { ...lembrete, edges: lembrete.edges.filter((e) => e.source !== "espera") };
    const parado = iniciarFluxo(g, "ini", ctx("oi")).sessao;
    expect(retomarFluxo(g, parado, ctx(null)).sessao.status).toBe("completed");
  });

  it("'seguir se responder' é o padrão; 'esperar' segura a mensagem", () => {
    expect(seguirAoResponder(lembrete, "espera")).toBe(true);
    const g: Grafo = {
      ...lembrete,
      nodes: lembrete.nodes.map((n) =>
        n.id === "espera" ? { ...n, data: { ...n.data, se_responder: "esperar" } } : n,
      ),
    };
    expect(seguirAoResponder(g, "espera")).toBe(false);
  });

  it("intervalo tem piso e teto", () => {
    const agora = new Date(AGORA);
    const c = (quantidade: number, unidade: "segundos" | "dias") =>
      lerConfig("aguardar_intervalo", { quantidade, unidade });
    expect(fimDoIntervalo(c(1, "segundos"), agora).getTime() - agora.getTime()).toBe(3_000);
    expect(fimDoIntervalo(c(999, "dias"), agora).getTime() - agora.getTime()).toBe(ESPERA_MAXIMA_MS);
  });

  it("'Aguardar até 09:00' numa quarta 10:30 cai na quinta 09:00 de São Paulo", () => {
    const c = lerConfig("aguardar_ate", { hora: "09:00" });
    expect(proximoHorario(c, new Date(AGORA), "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-23T12:00:00.000Z",
    );
  });

  it("'Aguardar até 18:00' no mesmo dia, e só em dias úteis pula o fim de semana", () => {
    const hoje = lerConfig("aguardar_ate", { hora: "18:00" });
    expect(proximoHorario(hoje, new Date(AGORA), "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-22T21:00:00.000Z",
    );
    // Sexta 23/10 às 20:00 local; próximo dia útil às 09:00 = segunda 26/10.
    const uteis = lerConfig("aguardar_ate", { hora: "09:00", dias: [1, 2, 3, 4, 5] });
    expect(proximoHorario(uteis, new Date("2026-10-23T23:00:00Z"), "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-26T12:00:00.000Z",
    );
  });
});

describe("Notificar atendente", () => {
  it("vira efeito com a resposta do contato preenchida, e o fluxo segue", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("p", "pedir_digitar", { pergunta: "Qual o pedido?", variavel: "pedido" }),
        no("avisa", "notificar_atendente", { mensagem: "Cliente quer cancelar o pedido {{pedido}}" }),
        no("fim", "enviar_mensagem", { texto: "Já avisei a equipe." }),
      ],
      edges: [liga("ini", "p"), liga("p", "avisa"), liga("avisa", "fim")],
    };
    const parado = iniciarFluxo(g, "ini", ctx("oi")).sessao;
    const r = continuarFluxo(g, parado, ctx("1234"));
    expect(r.efeitos).toEqual([
      {
        tipo: "notificar",
        texto: "Cliente quer cancelar o pedido 1234",
        modelo: "Cliente quer cancelar o pedido …",
      },
      { tipo: "enviar", texto: "Já avisei a equipe." },
    ]);
  });
});

describe("média de satisfação na lista de chatbots", () => {
  it("converte 0–10 para 5 antes da média e ignora nota sem fluxo", async () => {
    const { mediaPorFluxo } = await import("./satisfacao");
    expect(
      mediaPorFluxo([
        { flow_id: "a", nota: 5, escala: "1_5" },
        { flow_id: "a", nota: 6, escala: "0_10" },
        { flow_id: null, nota: 1, escala: "1_5" },
      ]),
    ).toEqual({ a: { media: 4, total: 2 } });
  });
});
