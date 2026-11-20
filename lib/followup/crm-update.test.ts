import { describe, expect, it } from "vitest";

import { flowGraphSchema, type FlowEdge, type FlowGraph, type FlowNode } from "./graph-schema";
import { validateFlowForPublish } from "./validate-publish";

/** Passo "Atualizar o card": move etapa e/ou mexe em etiquetas, sem falar com o cliente. */

const pos = { x: 0, y: 0 };
const ETAPA = "8f5c2c1e-3b9a-4f55-9d7a-2a6f0c1d9e11";

function trigger(): FlowNode {
  return { id: "t1", type: "trigger", label: "início", position: pos, config: {} };
}
function atualizar(config: Record<string, unknown>): FlowNode {
  return {
    id: "n1",
    type: "crm_update",
    label: "Atualizar o card",
    position: pos,
    config: { adicionar_etiquetas: [], remover_etiquetas: [], ...config },
  } as FlowNode;
}
function fim(): FlowNode {
  return { id: "e1", type: "end", label: "fim", position: pos, config: { outcome: "exhausted" } };
}
function ligacao(id: string, source: string, target: string): FlowEdge {
  return { id, source, target, priority: 0, condition: { type: "always" } };
}
function grafo(no: FlowNode): FlowGraph {
  return {
    nodes: [trigger(), no, fim()],
    edges: [ligacao("a", "t1", "n1"), ligacao("b", "n1", "e1")],
    settings: { max_tentativas_pergunta: 3 },
  };
}

describe("nó crm_update", () => {
  it("o schema aceita etapa, etiquetas e rascunho vazio", () => {
    expect(flowGraphSchema.safeParse(grafo(atualizar({ etapa_id: ETAPA }))).success).toBe(true);
    expect(flowGraphSchema.safeParse(grafo(atualizar({ adicionar_etiquetas: ["quente"] }))).success).toBe(true);
    expect(flowGraphSchema.safeParse(grafo(atualizar({}))).success).toBe(true);
  });

  it("recusa etapa que não é id e etiqueta vazia", () => {
    expect(flowGraphSchema.safeParse(grafo(atualizar({ etapa_id: "abc" }))).success).toBe(false);
    expect(flowGraphSchema.safeParse(grafo(atualizar({ adicionar_etiquetas: [" "] }))).success).toBe(false);
  });

  it("publica quando muda alguma coisa", () => {
    expect(validateFlowForPublish(grafo(atualizar({ etapa_id: ETAPA })))).toEqual({ ok: true });
    expect(validateFlowForPublish(grafo(atualizar({ remover_etiquetas: ["frio"] })))).toEqual({ ok: true });
  });

  it("recusa publicar o passo vazio", () => {
    const r = validateFlowForPublish(grafo(atualizar({})));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("crm_update_vazio");
  });

  it("vale em fluxo somente interno (não envia nada ao cliente)", () => {
    const g = grafo(atualizar({ etapa_id: ETAPA }));
    g.settings = { max_tentativas_pergunta: 3, somente_interno: true };
    expect(validateFlowForPublish(g)).toEqual({ ok: true });
  });
});
