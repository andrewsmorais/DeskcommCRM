/**
 * "Enviar link de pagamento": a mensagem arrumada (o que é, valor, link), o
 * Pix numa mensagem só dele, a nota para a equipe, e "Sem link" quando a
 * variável do link chega vazia — mandar "pague por aqui:" sem link é pior que
 * não mandar.
 */
import { describe, expect, it } from "vitest";

import { iniciarFluxo, mensagensDoPagamento, type ContextoDoTurno } from "./motor";
import { lerConfig, saidasDoPasso, type Grafo } from "./passos";
import { contatoVazio } from "./regras";
import { problemasDoGrafo } from "./validar";

const cfg = (p: Record<string, unknown>) => lerConfig("enviar_pagamento", p);

describe("mensagens do pagamento", () => {
  it("texto com o que é, o valor e o link; nota para a equipe", () => {
    const r = mensagensDoPagamento(
      cfg({ descricao: "Consulta", valor: "R$ 150,00", link: "https://mpago.la/abc" }),
      {},
    );
    expect(r?.mensagens).toEqual([
      "💳 *Consulta* — R$ 150,00\n\nPague por aqui: https://mpago.la/abc",
    ]);
    expect(r?.nota).toMatch(/Consulta — R\$ 150,00/);
    expect(r?.nota).toMatch(/não confere se foi pago/);
  });

  it("Pix vai numa mensagem só dele, para o contato copiar inteiro", () => {
    const r = mensagensDoPagamento(
      cfg({ pix: "00020126...6304ABCD", mensagem: "Segue o Pix:" }),
      {},
    );
    expect(r?.mensagens).toEqual([
      "Segue o Pix:\n\nOu pague com Pix copia e cola, na próxima mensagem.",
      "00020126...6304ABCD",
    ]);
  });

  it("link de variável: preenche; vazio vira null", () => {
    const c = cfg({ link: "{{link_checkout}}" });
    expect(mensagensDoPagamento(c, { link_checkout: "https://loja/x" })?.mensagens[0]).toMatch(
      "https://loja/x",
    );
    expect(mensagensDoPagamento(c, {})).toBeNull();
  });
});

const ctx: ContextoDoTurno = {
  mensagem: "oi",
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
};
const grafo = (data: Record<string, unknown>): Grafo => ({
  nodes: [
    { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    { id: "p", type: "enviar_pagamento", position: { x: 0, y: 0 }, data },
    {
      id: "ok",
      type: "enviar_mensagem",
      position: { x: 0, y: 0 },
      data: { texto: "Qualquer dúvida, chama." },
    },
    { id: "sem", type: "transferir_equipe", position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [
    { id: "a", source: "i", target: "p", sourceHandle: "proximo" },
    { id: "b", source: "p", target: "ok", sourceHandle: "proximo" },
    { id: "c", source: "p", target: "sem", sourceHandle: "falha" },
  ],
});

describe("no fluxo", () => {
  it("enviou: segue por Enviado, com a nota", () => {
    const r = iniciarFluxo(grafo({ link: "https://x" }), "i", ctx);
    expect(r.efeitos.map((e) => e.tipo)).toEqual(["enviar", "nota", "enviar"]);
  });

  it("sem link depois das variáveis: nada sai para o contato e segue por Sem link", () => {
    const r = iniciarFluxo(grafo({ link: "{{link_checkout}}" }), "i", ctx);
    expect(r.efeitos.some((e) => e.tipo === "enviar")).toBe(false);
    expect(r.efeitos.some((e) => e.tipo === "transferir_equipe")).toBe(true);
  });

  it("saídas e validação", () => {
    expect(saidasDoPasso("enviar_pagamento", {}).map((s) => s.id)).toEqual(["proximo", "falha"]);
    expect(problemasDoGrafo(grafo({})).some((p) => p.includes("link ou o Pix"))).toBe(true);
    expect(
      problemasDoGrafo(grafo({ pix: "000201" })).some((p) => p.includes("link ou o Pix")),
    ).toBe(false);
  });
});
