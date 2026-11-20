/**
 * A decisão sobre a proposta da IA é gravada pela service role (0509), então a
 * rota tem de achar o lead na organização ATIVA — a única onde o papel foi
 * conferido. Antes, quem era atendente na organização A e só leitor na B
 * aprovava, com a sessão na A, a proposta de um lead da B (a RLS deixa o
 * leitor ver o lead).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ATIVA = "aaaaaaaa-0000-4000-8000-000000000001";
const OUTRA_ORG = "bbbbbbbb-0000-4000-8000-000000000002";
const LEAD = "cccccccc-0000-4000-8000-000000000003";
const CONTATO = "dddddddd-0000-4000-8000-000000000004";

const escritasAdmin = vi.fn();
let orgDoLead = OUTRA_ORG;

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "eeeeeeee-0000-4000-8000-000000000005", idioma: "pt-BR" },
    org: { orgId: ORG_ATIVA, role: "agent" },
  }),
}));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: async (...args: unknown[]) => {
    escritasAdmin("emitLeadActivity", args[1]);
    return { id: "f0000000-0000-4000-8000-000000000006" };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const q = {
        update: (v: unknown) => {
          escritasAdmin(`update:${tabela}`, v);
          return q;
        },
        eq: () => q,
        select: () => q,
        maybeSingle: async () => ({ data: { contact_id: CONTATO }, error: null }),
        then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  // Simula a RLS: o lead é VISÍVEL (o caller é leitor na outra org); só o
  // filtro de organização que a rota aplica o esconde.
  createClient: async () => ({
    from: (tabela: string) => {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (coluna: string, valor: unknown) => {
          filtros[coluna] = valor;
          return q;
        },
        maybeSingle: async () => {
          if (tabela === "crm_leads") {
            const visivel = !("organization_id" in filtros) || filtros.organization_id === orgDoLead;
            return {
              data: visivel ? { id: LEAD, organization_id: orgDoLead, contact_id: CONTATO, status: "open" } : null,
              error: null,
            };
          }
          if (tabela === "lead_state") {
            return { data: { next_action: "IA propõe: ligar amanhã", next_action_seq: 3 }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return q;
    },
  }),
}));

function pedido() {
  return new Request(`http://localhost/api/v1/leads/${LEAD}/next-action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approve", approved_seq: 3 }),
  });
}

describe("POST /api/v1/leads/[id]/next-action — organização da decisão", () => {
  beforeEach(() => {
    escritasAdmin.mockReset();
  });

  it("lead de OUTRA organização (onde o caller só lê): 404 e nada gravado", async () => {
    orgDoLead = OUTRA_ORG;
    const { POST } = await import("./route");
    const res = await POST(pedido() as never, { params: Promise.resolve({ id: LEAD }) } as never);
    expect(res.status).toBe(404);
    expect(escritasAdmin).not.toHaveBeenCalled();
  });

  it("CONTROLE: lead da organização ativa segue para a decisão", async () => {
    orgDoLead = ORG_ATIVA;
    const { POST } = await import("./route");
    const res = await POST(pedido() as never, { params: Promise.resolve({ id: LEAD }) } as never);
    expect(res.status).not.toBe(404);
    expect(escritasAdmin).toHaveBeenCalledWith(
      "emitLeadActivity",
      expect.objectContaining({ organizationId: ORG_ATIVA }),
    );
  });
});
