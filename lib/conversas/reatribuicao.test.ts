import { beforeEach, describe, expect, it, vi } from "vitest";

import { deveReatribuir } from "./reatribuicao";

/**
 * Reatribuição automática (paridade Umbler, migration 0514): a regra pura e o
 * consumidor de `message.received` com um banco falso.
 */
const chamadas: Array<{ rpc: string; args: Record<string, unknown> }> = [];
const notas: unknown[] = [];
let conversa: Record<string, unknown> | null;
let disponibilidade: Record<string, unknown> | null;
let settings: Record<string, unknown> = {};
const fluxo = {
  id: "70000000-0000-4000-8000-000000000009",
  is_active: true,
  grafo: { nodes: [{ id: "m", type: "inicio_manual", position: { x: 0, y: 0 }, data: {} }], edges: [] },
};

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/atendimento/origem", () => ({
  beginServiceAtOrigin: vi.fn(async () => ({ conversation_id: "c1", organization_id: "o", contact_id: "k", channel_session_id: "s", service_revision: 1 })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        insert: async (linha: unknown) => (notas.push(linha), { error: null }),
        maybeSingle: async () => ({
          data:
            tabela === "conversations"
              ? conversa
              : tabela === "attendant_availability"
                ? disponibilidade
                : tabela === "organizations"
                  ? { settings }
                  : fluxo,
          error: null,
        }),
      };
      return q;
    },
    rpc: async (rpc: string, args: Record<string, unknown>) => (chamadas.push({ rpc, args }), { data: null, error: null }),
  }),
}));

const { reatribuicaoHandler } = await import("./reatribuicao.handler");
const evento = { organization_id: "o", payload: { conversation_id: "c1" } } as never;

beforeEach(() => {
  chamadas.length = 0;
  notas.length = 0;
  settings = {};
  conversa = { contact_id: "k", channel_session_id: "s", assigned_to_user_id: "u1", assignee_kind: "user", is_group: false, status: "claimed" };
  disponibilidade = { is_available: false, reatribuicao: "offline" };
});

describe("regra", () => {
  it("desligada nunca; offline só indisponível; sempre sempre", () => {
    expect(deveReatribuir("desligada", false)).toBe(false);
    expect(deveReatribuir("offline", false)).toBe(true);
    expect(deveReatribuir("offline", true)).toBe(false);
    expect(deveReatribuir("sempre", true)).toBe(true);
    expect(deveReatribuir(undefined, false)).toBe(false);
  });
});

describe("consumidor de message.received", () => {
  it("atendente offline com a regra: sai da conversa, que volta para a fila, com nota", async () => {
    const r = await reatribuicaoHandler.handle(evento);
    expect(r.status).toBe("ok");
    expect(chamadas.map((c) => c.rpc)).toEqual(["fn_conversation_assign", "fn_request_channel_routing"]);
    expect(chamadas[0]?.args).toMatchObject({ p_to_user_id: null, p_reason: "release" });
    expect(JSON.stringify(notas)).toMatch(/voltou para a fila/);
  });

  it("disponível com a regra offline: nada acontece", async () => {
    disponibilidade = { is_available: true, reatribuicao: "offline" };
    const r = await reatribuicaoHandler.handle(evento);
    expect(r.status).toBe("skipped");
    expect(chamadas).toEqual([]);
  });

  it("grupo ou conversa da IA: nada acontece", async () => {
    conversa = { ...conversa!, is_group: true };
    expect((await reatribuicaoHandler.handle(evento)).status).toBe("skipped");
    conversa = { ...conversa!, is_group: false, assignee_kind: "ai" };
    expect((await reatribuicaoHandler.handle(evento)).status).toBe("skipped");
    expect(chamadas).toEqual([]);
  });

  it("empresa escolheu chatbot: sai e o chatbot começa (sem pedir a fila)", async () => {
    settings = { conversas: { reatribuicao: { acao: "chatbot", chatbot_id: fluxo.id } } };
    const r = await reatribuicaoHandler.handle(evento);
    expect(r.detail).toBe("chatbot");
    expect(chamadas.map((c) => c.rpc)).toEqual(["fn_conversation_assign", "emit_event"]);
    expect(chamadas[1]?.args).toMatchObject({ p_event_type: "chatbot.inicio_requested" });
  });
});
