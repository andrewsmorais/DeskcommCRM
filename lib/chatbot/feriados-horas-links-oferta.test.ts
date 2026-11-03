/**
 * Os quatro acréscimos de 03/11: feriados no "Horários", formato "hora" no
 * "Pedir para digitar", conferência dos links do texto e o passo "Enviar
 * oferta" com validade.
 */
import { describe, expect, it } from "vitest";

import { ehFeriado, feriadosDoAno, lerDatasDeFeriado, pascoa } from "./feriados";
import { linksDoTexto, linksQueBloqueiam } from "./links";
import { iniciarFluxo, type ContextoDoTurno } from "./motor";
import { saidasDoPasso, type Grafo } from "./passos";
import { comoHora, contatoVazio, respostaDoFormulario, respostaNoFormato } from "./regras";
import { problemasDoGrafo } from "./validar";

describe("feriados", () => {
  it("Páscoa e Sexta-feira Santa", () => {
    expect(pascoa(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(pascoa(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    expect(feriadosDoAno(2026, false)).toContain("2026-04-03");
  });

  it("Carnaval e Corpus Christi só com os pontos facultativos", () => {
    expect(feriadosDoAno(2026, false)).not.toContain("2026-02-17");
    expect(feriadosDoAno(2026, true)).toEqual(
      expect.arrayContaining(["2026-02-16", "2026-02-17", "2026-06-04"]),
    );
  });

  it("nacionais desligados não contam; datas da empresa contam", () => {
    const base = { feriados_nacionais: false, pontos_facultativos: false, datas: [] as string[] };
    expect(ehFeriado("2026-12-25", base)).toBe(false);
    expect(ehFeriado("2026-12-25", { ...base, feriados_nacionais: true })).toBe(true);
    expect(ehFeriado("2026-11-20", { ...base, feriados_nacionais: true })).toBe(true);
    expect(ehFeriado("2027-01-20", { ...base, datas: ["20/01"] })).toBe(true);
    expect(ehFeriado("2026-12-24", { ...base, datas: ["24/12/2026"] })).toBe(true);
    expect(ehFeriado("2027-12-24", { ...base, datas: ["24/12/2026"] })).toBe(false);
  });

  it("lê a lista escrita e descarta o que não é data", () => {
    expect(lerDatasDeFeriado("20/01, 09/07; 24/12/2026\n31/02 , amanhã, 1/5")).toEqual([
      "20/01",
      "09/07",
      "24/12/2026",
      "31/02",
    ]);
  });
});

describe("formato hora", () => {
  it.each([
    ["14", "14:00"],
    ["14h", "14:00"],
    ["14:30", "14:30"],
    ["14h30", "14:30"],
    ["às 9h", "09:00"],
    ["9:05", "09:05"],
    ["14 horas", "14:00"],
  ])("%s → %s", (entrada, saida) => expect(comoHora(entrada)).toBe(saida));

  it.each(["24:00", "14:60", "amanhã", "14 ou 15", ""])("%s não é hora", (entrada) =>
    expect(comoHora(entrada)).toBeNull(),
  );

  it("vale no Pedir para digitar e no formulário", () => {
    expect(respostaNoFormato("hora", "às 15h30")).toBe("15:30");
    expect(respostaNoFormato("hora", "de tarde")).toBeNull();
    expect(respostaDoFormulario({ tipo: "hora", gravar_em: "" }, "8h")).toMatchObject({
      valor: "08:00",
    });
  });
});

describe("links do texto", () => {
  it("separa perigoso, incompleto, http e https", () => {
    const r = linksDoTexto(
      "Veja https://loja.com/x, http://velho.com e javascript:alert(1) ou https://semponto",
    );
    expect(r).toEqual(
      expect.arrayContaining([
        { link: "https://loja.com/x", problema: null },
        { link: "http://velho.com", problema: "sem_https" },
        { link: "javascript:alert(1)", problema: "protocolo_perigoso" },
        { link: "https://semponto", problema: "malformado" },
      ]),
    );
  });

  it("variável no meio do link não é problema; http não bloqueia", () => {
    expect(linksDoTexto("https://pay.com/{{pedido}}")).toEqual([
      { link: "https://pay.com/{{pedido}}", problema: null },
    ]);
    expect(linksQueBloqueiam("http://velho.com")).toEqual([]);
    expect(linksQueBloqueiam("data:text/html,oi")).toHaveLength(1);
  });
});

const ctxEm = (iso: string): ContextoDoTurno => ({
  mensagem: "oi",
  agora: new Date(iso),
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
});

const fluxo = (tipo: string, data: Record<string, unknown>, saidas: [string, string][]): Grafo => ({
  nodes: [
    { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    { id: "p", type: tipo, position: { x: 0, y: 0 }, data },
    ...saidas.map(([, texto], k) => ({
      id: `m${k}`,
      type: "enviar_mensagem",
      position: { x: 0, y: 0 },
      data: { texto },
    })),
  ],
  edges: [
    { id: "a", source: "i", target: "p", sourceHandle: "proximo" },
    ...saidas.map(([saida], k) => ({
      id: `e${k}`,
      source: "p",
      target: `m${k}`,
      sourceHandle: saida,
    })),
  ],
});

const textos = (g: Grafo, iso: string) =>
  iniciarFluxo(g, "i", ctxEm(iso)).efeitos.flatMap((e) => (e.tipo === "enviar" ? [e.texto] : []));

describe("Horários com feriado", () => {
  const g = (data: Record<string, unknown>) =>
    fluxo("horarios", { faixas: [{ inicio: "08:00", fim: "18:00" }], ...data }, [
      ["dentro", "aberto"],
      ["fora", "fechado"],
    ]);

  it("Natal às 10h, com nacionais: fora do horário", () => {
    // 13:00 UTC = 10:00 em São Paulo.
    expect(textos(g({ feriados_nacionais: true }), "2026-12-25T13:00:00Z")).toEqual(["fechado"]);
    expect(textos(g({}), "2026-12-25T13:00:00Z")).toEqual(["aberto"]);
  });

  it("o dia é o do fuso da empresa, não o UTC", () => {
    // 26/12 01:00 UTC ainda é 25/12 22:00 em São Paulo — e 22h já é fora.
    // 24/12 23:30 em SP é 25/12 02:30 UTC: o dia de SP (24) não é feriado.
    const aberto24h = (data: Record<string, unknown>) =>
      fluxo("horarios", { faixas: [{ inicio: "00:00", fim: "23:59" }], ...data }, [
        ["dentro", "aberto"],
        ["fora", "fechado"],
      ]);
    expect(textos(aberto24h({ feriados_nacionais: true }), "2026-12-25T02:30:00Z")).toEqual([
      "aberto",
    ]);
    expect(textos(aberto24h({ feriados: ["24/12"] }), "2026-12-25T02:30:00Z")).toEqual(["fechado"]);
  });
});

describe("Enviar oferta", () => {
  const g = (data: Record<string, unknown>) =>
    fluxo("enviar_oferta", data, [
      ["proximo", "depois"],
      ["vencida", "acabou"],
    ]);

  it("dentro da validade: manda com a linha de validade e segue", () => {
    expect(
      textos(g({ texto: "20% off", valida_ate: "2026-11-03" }), "2026-11-04T02:00:00Z"),
    ).toEqual(["20% off\n\n⏳ Válida até 03/11/2026.", "depois"]);
  });

  it("{{validade}} no texto dispensa a linha; mostrar_validade desligado também", () => {
    expect(
      textos(
        g({ texto: "Vale até {{ validade }}!", valida_ate: "2026-11-30" }),
        "2026-11-03T13:00:00Z",
      )[0],
    ).toBe("Vale até 30/11/2026!");
    expect(
      textos(
        g({ texto: "20% off", valida_ate: "2026-11-30", mostrar_validade: false }),
        "2026-11-03T13:00:00Z",
      )[0],
    ).toBe("20% off");
  });

  it("vencida: nada da oferta sai e segue por Oferta vencida", () => {
    // 04/11 03:30 UTC = 04/11 00:30 em São Paulo.
    expect(
      textos(g({ texto: "20% off", valida_ate: "2026-11-03" }), "2026-11-04T03:30:00Z"),
    ).toEqual(["acabou"]);
  });

  it("vencida sem nada ligado: o fluxo termina, não cai no Enviada", () => {
    const so = fluxo("enviar_oferta", { texto: "20% off", valida_ate: "2026-01-01" }, [
      ["proximo", "depois"],
    ]);
    expect(textos(so, "2026-11-03T13:00:00Z")).toEqual([]);
  });

  it("sem data não vence", () => {
    expect(textos(g({ texto: "Oferta" }), "2030-01-01T13:00:00Z")).toEqual(["Oferta", "depois"]);
  });

  it("saídas e validação", () => {
    expect(saidasDoPasso("enviar_oferta", {}).map((s) => s.id)).toEqual(["proximo", "vencida"]);
    expect(problemasDoGrafo(g({})).some((p) => p.includes("escreva a mensagem"))).toBe(true);
    expect(
      problemasDoGrafo(g({ texto: "Veja javascript:void(0)" })).some((p) =>
        p.includes("não abre uma página"),
      ),
    ).toBe(true);
  });
});

describe("validação dos links", () => {
  it("Enviar mensagem com link perigoso ou incompleto não liga; http liga", () => {
    const g = (texto: string) => fluxo("enviar_mensagem", { texto }, []);
    expect(problemasDoGrafo(g("Acesse https://site")).join()).toMatch(/não abre uma página/);
    expect(problemasDoGrafo(g("Acesse http://site.com.br")).join()).not.toMatch(/link/);
    expect(problemasDoGrafo(g("Acesse https://site.com.br")).join()).not.toMatch(/link/);
  });

  it("link de pagamento: endereço de página ou {{variavel}}", () => {
    const g = (link: string) => fluxo("enviar_pagamento", { link }, []);
    expect(problemasDoGrafo(g("{{link_checkout}}")).join()).not.toMatch(/https/);
    expect(problemasDoGrafo(g("https://mpago.la/abc")).join()).not.toMatch(/https/);
    expect(problemasDoGrafo(g("mpago.la/abc")).join()).toMatch(/precisa começar com https/);
    expect(problemasDoGrafo(g("javascript:alert(1)")).join()).toMatch(/precisa começar com https/);
  });
});
