/**
 * "Aguardar até" numa data (fixa ou de uma resposta, com dias antes/depois) e
 * "Guardar em variável". A data é lida no fuso da empresa; sem data válida o
 * fluxo não espera e segue por "Sem data válida".
 */
import { describe, expect, it } from "vitest";

import { iniciarFluxo, retomarFluxo, type ContextoDoTurno } from "./motor";
import { lerConfig, saidasDoPasso, type Grafo } from "./passos";
import { contatoVazio } from "./regras";
import { diaDoValor, instanteDaData } from "./relogio";
import { problemasDoGrafo } from "./validar";

const FUSO = "America/Sao_Paulo";
const AGORA = new Date("2026-11-03T13:00:00Z"); // 10:00 em São Paulo
const ctx = (mensagem: string | null, agora = AGORA): ContextoDoTurno => ({
  mensagem,
  agora,
  fuso: FUSO,
  contato: contatoVazio(),
});
const cfg = (p: Record<string, unknown>) => lerConfig("aguardar_ate", { quando: "data", ...p });
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

describe("dia de um valor", () => {
  it("dd/mm/aaaa, AAAA-MM-DD e o instante do Agendar horário (no fuso)", () => {
    expect(diaDoValor("20/11/2026", FUSO)).toEqual({ ano: 2026, mes: 11, dia: 20 });
    expect(diaDoValor("2026-11-20", FUSO)).toEqual({ ano: 2026, mes: 11, dia: 20 });
    // 02:00 UTC do dia 21 ainda é dia 20 em São Paulo.
    expect(diaDoValor("2026-11-21T02:00:00.000Z", FUSO)).toEqual({ ano: 2026, mes: 11, dia: 20 });
  });
  it.each(["31/02/2026", "amanhã", "", "20/11"])("%s não é dia", (v) =>
    expect(diaDoValor(v, FUSO)).toBeNull(),
  );
});

describe("instante da data", () => {
  it("data fixa, no horário do fuso da empresa", () => {
    expect(
      instanteDaData(cfg({ data: "2026-11-20", hora: "09:00" }), {}, AGORA, FUSO)?.toISOString(),
    ).toBe("2026-11-20T12:00:00.000Z");
  });
  it("véspera de uma data respondida, virando o mês", () => {
    const c = cfg({
      fonte_da_data: "resposta",
      variavel: "data_consulta",
      deslocamento_dias: -1,
      hora: "08:30",
    });
    expect(instanteDaData(c, { data_consulta: "01/12/2026" }, AGORA, FUSO)?.toISOString()).toBe(
      "2026-11-30T11:30:00.000Z",
    );
  });
  it("sem data válida: passou, faltou, fora do formato ou mais de um ano", () => {
    const resp = cfg({ fonte_da_data: "resposta", variavel: "d" });
    expect(instanteDaData(cfg({ data: "2026-11-03", hora: "09:00" }), {}, AGORA, FUSO)).toBeNull();
    expect(instanteDaData(resp, {}, AGORA, FUSO)).toBeNull();
    expect(instanteDaData(resp, { d: "semana que vem" }, AGORA, FUSO)).toBeNull();
    expect(instanteDaData(cfg({ data: "2028-01-10" }), {}, AGORA, FUSO)).toBeNull();
  });
});

const g = (data: Record<string, unknown>): Grafo => ({
  nodes: [
    { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    {
      id: "gv",
      type: "guardar_valor",
      position: { x: 0, y: 0 },
      data: { variavel: "data_consulta", valor: "{{data_vinda}}" },
    },
    { id: "a", type: "aguardar_ate", position: { x: 0, y: 0 }, data: { quando: "data", ...data } },
    {
      id: "lembra",
      type: "enviar_mensagem",
      position: { x: 0, y: 0 },
      data: { texto: "Amanhã é a sua consulta ({{data_consulta}})." },
    },
    {
      id: "sem",
      type: "enviar_mensagem",
      position: { x: 0, y: 0 },
      data: { texto: "Não achei a data." },
    },
  ],
  edges: [
    { id: "e1", source: "i", target: "gv", sourceHandle: "proximo" },
    { id: "e2", source: "gv", target: "a", sourceHandle: "proximo" },
    { id: "e3", source: "a", target: "lembra", sourceHandle: "proximo" },
    { id: "e4", source: "a", target: "sem", sourceHandle: "vencida" },
  ],
});

describe("no fluxo", () => {
  const vespera = {
    fonte_da_data: "resposta",
    variavel: "data_consulta",
    deslocamento_dias: -1,
    hora: "09:00",
  };

  it("Guardar em variável preenche e o Aguardar até espera até a véspera", () => {
    const r = iniciarFluxo(g(vespera), "i", { ...ctx("oi") }, { data_vinda: "10/11/2026" });
    expect(r.sessao.dados.data_consulta).toBe("10/11/2026");
    expect(r.sessao).toMatchObject({
      status: "waiting_timer",
      no_atual: "a",
      retomar_em: "2026-11-09T12:00:00.000Z",
    });
    const acordou = retomarFluxo(g(vespera), r.sessao, ctx(null, new Date("2026-11-09T12:00:05Z")));
    expect(textos(acordou.efeitos)).toEqual(["Amanhã é a sua consulta (10/11/2026)."]);
  });

  it("sem data válida: não espera e segue por Sem data válida", () => {
    const r = iniciarFluxo(g(vespera), "i", ctx("oi"), { data_vinda: "não sei" });
    expect(r.sessao.status).not.toBe("waiting_timer");
    expect(textos(r.efeitos)).toEqual(["Não achei a data."]);
  });

  it("saídas e validação", () => {
    expect(saidasDoPasso("aguardar_ate", {}).map((s) => s.id)).toEqual(["proximo"]);
    expect(saidasDoPasso("aguardar_ate", { quando: "data" }).map((s) => s.id)).toEqual([
      "proximo",
      "vencida",
    ]);
    expect(problemasDoGrafo(g({ fonte_da_data: "fixa" })).join()).toMatch(/escolha a data/);
    expect(problemasDoGrafo(g({ fonte_da_data: "resposta" })).join()).toMatch(/nome da resposta/);
    expect(problemasDoGrafo(g(vespera)).join()).not.toMatch(/data|resposta/);
  });

  it("modo dias continua igual", () => {
    const r = iniciarFluxo(g({ quando: "dias", hora: "09:00" }), "i", ctx("oi"));
    // 10:00 em SP já passou das 9h: amanhã às 9h.
    expect(r.sessao.retomar_em).toBe("2026-11-04T12:00:00.000Z");
  });
});
