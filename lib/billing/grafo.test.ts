import { beforeEach, describe, expect, it, vi } from "vitest";

import { flowGraphSchema, flowNodeSchema, type FlowNode } from "@/lib/followup/graph-schema";
import { verificarRecursoDoPlano } from "./acesso";
import { recursosDoGrafo, verificarGrafoDoPlano } from "./grafo";

vi.mock("./acesso", () => ({ verificarRecursoDoPlano: vi.fn() }));

function no(type: FlowNode["type"], config: unknown = {}) {
  return flowNodeSchema.parse({ id: type, type, label: type, position: { x: 0, y: 0 }, config });
}

function grafo(...nodes: FlowNode[]) {
  return flowGraphSchema.parse({
    nodes: [no("trigger"), ...nodes, no("end", { outcome: "converted" })],
    edges: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verificarRecursoDoPlano).mockResolvedValue({ ok: true });
});

describe("recursos comerciais do fluxo publicado", () => {
  it("preserva a coleta linear do Essencial sem consultar capacidade premium", async () => {
    const fluxo = grafo(no("collect", { key: "nome", label: "Seu nome" }));
    expect(recursosDoGrafo(fluxo)).toEqual([]);
    expect(await verificarGrafoDoPlano("org-confiavel", fluxo)).toEqual({ ok: true });
    expect(verificarRecursoDoPlano).not.toHaveBeenCalled();
  });

  it.each([
    ["condition", { checks: [{ field: "tag", op: "contains", value: "interessado" }] }],
    ["repeat", { max_count: 3 }],
    ["ai_classify", { classes: ["venda", "suporte"], grace_timeout_ms: 900000 }],
    [
      "match_reply",
      {
        branches: [{ id: "venda", label: "Vendas", op: "contains", pattern: "comprar" }],
        grace_timeout_ms: 900000,
      },
    ],
    ["action", { mode: "text", body: "Podemos ajudar?" }],
  ] as const)("%s exige processos", (tipo, config) => {
    expect(recursosDoGrafo(grafo(no(tipo, config)))).toEqual(["processos"]);
  });

  it("um nó skill exige skills mesmo num atendimento linear", () => {
    expect(recursosDoGrafo(grafo(no("skill", { skill_name: "consultar-catalogo" })))).toEqual([
      "skills",
    ]);
  });

  it("uma skill ao finalizar também exige skills", () => {
    const fluxo = flowGraphSchema.parse({
      nodes: [
        no("trigger"),
        no("end", {
          outcome: "converted",
          ao_finalizar: { tipo: "skill", skill_name: "fechar-venda" },
        }),
      ],
      edges: [],
    });
    expect(recursosDoGrafo(fluxo)).toEqual(["skills"]);
  });

  it.each([{ tipo: "nada" }, { tipo: "ia", prompt: "Continue o atendimento" }])(
    "finalização %s mantém a IA básica",
    (ao_finalizar) => {
      const fluxo = flowGraphSchema.parse({
        nodes: [no("trigger"), no("end", { outcome: "converted", ao_finalizar })],
        edges: [],
      });
      expect(recursosDoGrafo(fluxo)).toEqual([]);
    },
  );

  it("deduplica capacidades e consulta a organização recebida em cada uma", async () => {
    const fluxo = grafo(
      no("skill", { skill_name: "catalogo" }),
      no("action", { mode: "text", body: "Olá" }),
      no("repeat", { max_count: 2 }),
    );
    expect(recursosDoGrafo(fluxo)).toEqual(["skills", "processos"]);
    expect(await verificarGrafoDoPlano("org-confiavel", fluxo)).toEqual({ ok: true });
    expect(vi.mocked(verificarRecursoDoPlano).mock.calls).toEqual([
      ["org-confiavel", "skills"],
      ["org-confiavel", "processos"],
    ]);
  });

  it("devolve a primeira recusa e não consulta as demais capacidades", async () => {
    const recusado = {
      ok: false,
      status: 503,
      code: "billing_unavailable",
      message: "Tente novamente",
    } as const;
    vi.mocked(verificarRecursoDoPlano).mockResolvedValue(recusado);
    const fluxo = grafo(no("skill", { skill_name: "catalogo" }), no("repeat", { max_count: 2 }));
    expect(await verificarGrafoDoPlano("org", fluxo)).toBe(recusado);
    expect(verificarRecursoDoPlano).toHaveBeenCalledTimes(1);
  });
});
