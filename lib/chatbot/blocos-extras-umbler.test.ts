/**
 * Opções extras dos blocos (paridade Umbler): botão de link no Enviar mensagem
 * e o "Iniciar manualmente" com não listado e perguntas ao atendente.
 */
import { describe, expect, it } from "vitest";

import { iniciarFluxo, type ContextoDoTurno } from "./motor";
import { lerConfig, type Grafo } from "./passos";
import { contatoVazio } from "./regras";
import { problemasDoGrafo } from "./validar";

const ctx: ContextoDoTurno = {
  mensagem: "oi",
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
};

function grafo(msg: Record<string, unknown>): Grafo {
  return {
    nodes: [
      { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
      { id: "m", type: "enviar_mensagem", position: { x: 0, y: 0 }, data: msg },
    ],
    edges: [{ id: "e", source: "i", target: "m", sourceHandle: "proximo" }],
  };
}
const textos = (g: Grafo, dados: Record<string, string> = {}) =>
  iniciarFluxo(g, "i", ctx, dados).efeitos.flatMap((e) => (e.tipo === "enviar" ? [e.texto] : []));

describe("Enviar mensagem com botão de link", () => {
  it("vira texto embaixo da mensagem: Rótulo: endereço", () => {
    expect(textos(grafo({ texto: "Seu pedido saiu!", botao_texto: "Rastrear", botao_url: "https://loja.com/r/1" }))).toEqual([
      "Seu pedido saiu!\n\nRastrear: https://loja.com/r/1",
    ]);
  });

  it("o endereço aceita variável", () => {
    expect(
      textos(grafo({ texto: "Pague aqui", botao_texto: "Pagar", botao_url: "{{link}}" }), { link: "https://pag.com/x" }),
    ).toEqual(["Pague aqui\n\nPagar: https://pag.com/x"]);
  });

  it("sem botão, nada muda (fluxo antigo)", () => {
    expect(textos(grafo({ texto: "Olá" }))).toEqual(["Olá"]);
  });

  it("o fluxo não liga com endereço que não abre página, nem com rótulo sem endereço", () => {
    expect(problemasDoGrafo(grafo({ texto: "x", botao_texto: "Ver", botao_url: "javascript:alert(1)" })).join(" ")).toMatch(
      /https:\/\//,
    );
    expect(problemasDoGrafo(grafo({ texto: "x", botao_texto: "Ver" })).join(" ")).toMatch(/endereço do botão/);
  });
});

describe("Iniciar manualmente", () => {
  it("fluxo antigo: listado e sem perguntas", () => {
    const c = lerConfig("inicio_manual", {});
    expect(c.nao_listado).toBe(false);
    expect(c.perguntas).toEqual([]);
  });

  it("guarda até 5 perguntas, com variável em letras minúsculas", () => {
    const c = lerConfig("inicio_manual", {
      nao_listado: true,
      perguntas: [{ variavel: "numero_do_pedido", rotulo: "Número do pedido" }],
    });
    expect(c.nao_listado).toBe(true);
    expect(c.perguntas[0]?.variavel).toBe("numero_do_pedido");
  });
});
