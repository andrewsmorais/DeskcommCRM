import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/atendimento/origem", () => ({
  beginServiceAtOrigin: vi.fn(async () => ({ conversation_id: "c1" })),
}));

import { pedirChatbotManual, temPassoFinalizar } from "./iniciar-manual";

/** O chatbot de encerramento só é aceito se tiver quem encerre a conversa. */
describe("temPassoFinalizar", () => {
  const no = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, data: {} });

  it("aceita o fluxo com o passo Finalizar conversa", () => {
    const g = { nodes: [no("a", "inicio_manual"), no("b", "finalizar_conversa")], edges: [] };
    expect(temPassoFinalizar(g as never)).toBe(true);
  });

  it("recusa o fluxo sem ele — o chatbot terminaria e a conversa ficaria aberta", () => {
    const g = { nodes: [no("a", "inicio_manual"), no("b", "mensagem")], edges: [] };
    expect(temPassoFinalizar(g as never)).toBe(false);
  });
});

describe("pedirChatbotManual — respostas do atendente", () => {
  const ORG = "50000000-0000-4000-8000-000000000001";
  const grafo = {
    nodes: [
      {
        id: "m",
        type: "inicio_manual",
        position: { x: 0, y: 0 },
        data: { perguntas: [{ variavel: "pedido", rotulo: "Número do pedido" }] },
      },
      { id: "f", type: "finalizar_conversa", position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [{ id: "e", source: "m", target: "f", sourceHandle: "proximo" }],
  };
  function clientes() {
    const emitidos: unknown[] = [];
    const tabela = (linha: unknown) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: linha, error: null }) };
      return q;
    };
    const supabase = {
      from: (t: string) =>
        t === "conversations"
          ? tabela({ id: "c1", contact_id: "k1", channel_session_id: "s1", is_group: false, contacts: { is_blocked: false } })
          : tabela({ id: "f1", name: "Pesquisa", is_active: true, grafo }),
    };
    const admin = {
      rpc: async (nome: string, args: unknown) => {
        if (nome === "emit_event") emitidos.push(args);
        return { data: null, error: null };
      },
      from: () => ({}),
    };
    return { supabase, admin, emitidos };
  }

  it("só entram as variáveis que o fluxo declara", async () => {
    const { supabase, admin, emitidos } = clientes();
    const r = await pedirChatbotManual(supabase as never, admin as never, {
      orgId: ORG,
      conversationId: "c1",
      flowId: "f1",
      userId: "u1",
      requestId: "r1",
      variaveis: { pedido: " 1234 ", intruso: "x" },
    });
    expect(r.ok).toBe(true);
    const p = (emitidos[0] as { p_payload: { variaveis: Record<string, string> } }).p_payload;
    expect(p.variaveis).toEqual({ pedido: "1234" });
  });
});
