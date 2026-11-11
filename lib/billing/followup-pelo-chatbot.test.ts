/**
 * "Follow-up só pelo chatbot" (decisão do dono, 03/11/2026): no plano sem o
 * Follow-up automático, cabe o fluxo de início manual com texto ou modelo,
 * espera fixa, tarefa e fim — e a régua do grafo deixa esse passar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { flowGraphSchema, flowNodeSchema, type FlowNode } from "@/lib/followup/graph-schema";
import { verificarRecursoDoPlano } from "./acesso";
import { cabeNoFollowupPeloChatbot, problemasDoFollowupPeloChatbot } from "./followup-pelo-chatbot";
import { verificarGrafoDoPlano } from "./grafo";

vi.mock("./acesso", () => ({ verificarRecursoDoPlano: vi.fn() }));

const no = (type: FlowNode["type"], config: unknown = {}, label: string = type) =>
  flowNodeSchema.parse({ id: label, type, label, position: { x: 0, y: 0 }, config });
const grafo = (...nodes: FlowNode[]) =>
  flowGraphSchema.parse({
    nodes: [no("trigger"), ...nodes, no("end", { outcome: "converted" })],
    edges: [],
  });

const TEXTO = no("action", { mode: "text", body: "Oi! Ainda tem interesse?" }, "Lembrete");
const ESPERA = no("wait", { mode: "fixed", duration_ms: 86_400_000 }, "Espera 1 dia");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verificarRecursoDoPlano).mockResolvedValue({
    ok: false,
    code: "billing_feature",
    status: 403,
    message: "do Impulso",
  });
});

describe("o que cabe no follow-up pelo chatbot", () => {
  it("início manual, espera fixa, texto, modelo, tarefa e fim cabem", () => {
    const modelo = no(
      "action",
      { mode: "template", template_id: "66666666-6666-4666-8666-666666666666" },
      "Modelo",
    );
    expect(problemasDoFollowupPeloChatbot(grafo(ESPERA, TEXTO, modelo), "manual")).toEqual([]);
  });

  it("gatilho automático não cabe", () => {
    expect(problemasDoFollowupPeloChatbot(grafo(TEXTO), "silence").join()).toMatch(
      /início precisa ser manual/,
    );
  });

  it.each([
    [no("action", { mode: "ai_message", prompt_hint: "retome" }, "IA"), /escrita pela IA/],
    [
      no("wait", { mode: "smart", min_ms: 3_600_000, max_ms: 86_400_000 }, "Espera IA"),
      /tempo fixo/,
    ],
    [
      no("condition", { checks: [{ field: "tag", op: "contains", value: "x" }] }, "Se"),
      /condições/,
    ],
    [no("repeat", { max_count: 3 }, "Repete"), /repetição/],
  ])("%#: o passo do Impulso aparece pelo nome", (passo, motivo) => {
    const problemas = problemasDoFollowupPeloChatbot(grafo(passo as FlowNode), "manual");
    expect(problemas.join()).toMatch(motivo);
    expect(problemas.join()).toContain(`“${(passo as FlowNode).label}”`);
  });
});

describe("régua do grafo com o gatilho", () => {
  it("o follow-up pelo chatbot passa sem consultar o plano", async () => {
    expect(await verificarGrafoDoPlano("org", grafo(ESPERA, TEXTO), { gatilho: "manual" })).toEqual(
      { ok: true },
    );
    expect(verificarRecursoDoPlano).not.toHaveBeenCalled();
  });

  it("o mesmo fluxo com gatilho automático precisa do Follow-up automático (Impulso)", async () => {
    // Desde 11/11/2026 a primeira régua fora do formato "só pelo chatbot" é o
    // próprio recurso de follow-up; ramificação e skill vêm depois.
    const r = await verificarGrafoDoPlano("org", grafo(TEXTO), { gatilho: "silence" });
    expect(r.ok).toBe(false);
    expect(verificarRecursoDoPlano).toHaveBeenCalledWith("org", "follow_up");
  });

  it("sem gatilho (roteiro, dublê antigo) a régua é a de sempre", async () => {
    expect((await verificarGrafoDoPlano("org", grafo(TEXTO))).ok).toBe(false);
    expect(cabeNoFollowupPeloChatbot(grafo(TEXTO), "manual")).toBe(true);
  });
});
