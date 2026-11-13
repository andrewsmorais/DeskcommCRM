import { describe, expect, it } from "vitest";

import { continuarFluxo, iniciarFluxo, type ContextoDoTurno } from "./motor";
import type { Grafo } from "./passos";
import { contatoVazio } from "./regras";
import { resumirEstatistica } from "./estatistica";

const ctx = (mensagem: string): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
});

describe("estatística por bloco", () => {
  it("soma os dias e dá a % de cada saída sobre o bloco", () => {
    const r = resumirEstatistica([
      { node_id: "menu", saida: "opcao-0", contagem: 3 },
      { node_id: "menu", saida: "opcao-0", contagem: 3 },
      { node_id: "menu", saida: "opcao-1", contagem: 2 },
      { node_id: "fim", saida: "fim", contagem: 8 },
    ]);
    const menu = r.find((b) => b.node_id === "menu")!;
    expect(menu.total).toBe(8);
    expect(menu.saidas).toEqual([
      { saida: "opcao-0", contagem: 6, porcentagem: 75 },
      { saida: "opcao-1", contagem: 2, porcentagem: 25 },
    ]);
  });

  it("o motor anota cada bloco CONCLUÍDO e por onde seguiu; o que espera só entra ao responder", () => {
    const g: Grafo = {
      nodes: [
        { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
        { id: "m", type: "pedir_escolher", position: { x: 0, y: 0 }, data: { pergunta: "?", opcoes: ["A", "B"] } },
        { id: "f", type: "finalizar_conversa", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: "a", source: "i", target: "m", sourceHandle: "proximo" },
        { id: "b", source: "m", target: "f", sourceHandle: "opcao-1" },
      ],
    };
    const r1 = iniciarFluxo(g, "i", ctx("oi"));
    expect(r1.caminho).toEqual([{ no: "i", saida: "proximo" }]);
    const r2 = continuarFluxo(g, r1.sessao, ctx("2"));
    expect(r2.caminho?.[0]).toEqual({ no: "m", saida: "opcao-1" });
    expect(r2.caminho?.some((p) => p.no === "f")).toBe(true);
  });
});
