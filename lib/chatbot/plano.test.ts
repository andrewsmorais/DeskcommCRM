import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing", () => ({ canUse: vi.fn(), getOrganizationBilling: vi.fn() }));
vi.mock("@/lib/billing/acesso", () => ({ verificarRecursoDoPlano: vi.fn() }));

import type { Grafo } from "./passos";
import { disputamNumero, numerosDoFluxo, usaPassoAvancado } from "./plano";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function fluxo(...nos: { type: string; data?: Record<string, unknown> }[]): Grafo {
  return {
    nodes: nos.map((n, i) => ({
      id: `n${i}`,
      type: n.type,
      position: { x: 0, y: 0 },
      data: n.data ?? {},
    })),
    edges: [],
  };
}
const noNumero = (id: string | null) => ({
  type: "inicio_canal",
  data: { channel_session_id: id },
});

describe("um chatbot de entrada por número", () => {
  it("fluxos em números diferentes não disputam — os dois ficam ligados", () => {
    expect(disputamNumero(fluxo(noNumero(A)), fluxo(noNumero(B)))).toBe(false);
  });
  it("mesmo número disputa", () => {
    expect(disputamNumero(fluxo(noNumero(A)), fluxo(noNumero(A), noNumero(B)))).toBe(true);
  });
  it("'qualquer número' disputa com todos", () => {
    expect(numerosDoFluxo(fluxo(noNumero(null)))).toBe("todos");
    expect(disputamNumero(fluxo(noNumero(null)), fluxo(noNumero(B)))).toBe(true);
  });
  it("fluxo só de automação ou manual não disputa número nenhum", () => {
    expect(disputamNumero(fluxo({ type: "inicio_manual" }), fluxo(noNumero(null)))).toBe(false);
  });
});

describe("chatbot avançado (Impulso)", () => {
  it("os passos básicos do Essencial não são avançados", () => {
    expect(
      usaPassoAvancado(
        fluxo(
          noNumero(A),
          { type: "enviar_mensagem" },
          { type: "pedir_escolher" },
          { type: "horarios" },
          { type: "transferir_equipe" },
          { type: "editar_etiquetas" },
          { type: "agendar_horario" },
          { type: "negocio_funil" },
          { type: "pedir_avaliacao" },
          { type: "finalizar_conversa" },
        ),
      ),
    ).toBe(false);
  });
  it.each([
    "webhook",
    "aguardar_intervalo",
    "acionar_fluxo",
    "bloquear_contato",
    "tem_etiqueta",
    "inicio_automacao",
  ])("%s é do Chatbot avançado", (tipo) => {
    expect(usaPassoAvancado(fluxo(noNumero(A), { type: tipo }))).toBe(true);
  });
});
