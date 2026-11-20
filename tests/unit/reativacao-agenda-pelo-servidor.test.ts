/**
 * A retomada aprovada agenda o envio PELO SERVIDOR e com a fronteira do
 * atendimento.
 *
 * Dois achados da auditoria de 04/11/2026 sobre a mesma linha:
 *   1. `cron_jobs` era gravável pelo login (qualquer membro, até leitor,
 *      agendava pela REST o envio que quisesse). A migration 0501 fechou a
 *      escrita, e esta rota — a única que gravava com a sessão — passa a gravar
 *      com a service role, depois de `requireRole("agent")`.
 *   2. O payload saía sem `service_boundary`; o worker cancelava o job como
 *      fronteira vencida, e a retomada aceita nunca era enviada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const CONTATO = "33333333-3333-4333-8333-333333333333";
const PROPOSTA = "44444444-4444-4444-8444-444444444444";
const FRONTEIRA = {
  organization_id: ORG,
  contact_id: CONTATO,
  conversation_id: "55555555-5555-4555-8555-555555555555",
  service_revision: 3,
  demanda_id: null,
  demanda_revision: null,
};

const estado = vi.hoisted(() => ({
  insercoesDaSessao: [] as { tabela: string; linha: unknown }[],
  insercoesDoServidor: [] as { tabela: string; linha: unknown }[],
}));

function consulta(tabela: string, insercoes: { tabela: string; linha: unknown }[]) {
  const resultado = (): unknown => {
    if (tabela === "crm_lead_reactivations")
      return { data: { id: PROPOSTA, expires_at: null }, error: null };
    if (tabela === "crm_leads") return { data: { contact_id: CONTATO }, error: null };
    return { data: null, error: null };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq", "gt", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => resultado();
  q.insert = async (linha: unknown) => {
    insercoes.push({ tabela, linha });
    return { error: null };
  };
  return q;
}

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "66666666-6666-4666-8666-666666666666", idioma: "pt-BR" },
    org: { orgId: ORG, role: "agent" },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => consulta(t, estado.insercoesDaSessao) }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => consulta(t, estado.insercoesDoServidor) }),
}));
vi.mock("@/lib/atendimento/origem", () => ({
  beginServiceAtOrigin: vi.fn(async () => FRONTEIRA),
}));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/leads/activity-write-failure", () => ({ registraFalhaDeAtividade: vi.fn() }));

import { POST } from "@/app/api/v1/leads/[id]/reactivation/route";

function pedido() {
  return new NextRequest(`http://localhost/api/v1/leads/${LEAD}/reactivation`, {
    method: "POST",
    body: JSON.stringify({ decision: "accept", proposal_id: PROPOSTA }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  estado.insercoesDaSessao = [];
  estado.insercoesDoServidor = [];
});

describe("POST /api/v1/leads/[id]/reactivation — accept", () => {
  it("grava cron_jobs com a service role, nunca com a sessão", async () => {
    const res = await POST(pedido(), { params: Promise.resolve({ id: LEAD }) });
    expect(res.status).toBe(200);
    expect(estado.insercoesDaSessao.filter((i) => i.tabela === "cron_jobs")).toEqual([]);
    expect(estado.insercoesDoServidor.filter((i) => i.tabela === "cron_jobs")).toHaveLength(1);
    const corpo = (await res.json()) as { data: { envio_agendado: boolean } };
    expect(corpo.data.envio_agendado).toBe(true);
  });

  it("o payload leva a fronteira do atendimento (sem ela o worker cancela o envio)", async () => {
    await POST(pedido(), { params: Promise.resolve({ id: LEAD }) });
    const linha = estado.insercoesDoServidor.find((i) => i.tabela === "cron_jobs")?.linha as {
      organization_id: string;
      contact_id: string;
      payload: Record<string, unknown>;
    };
    expect(linha.organization_id).toBe(ORG);
    expect(linha.contact_id).toBe(CONTATO);
    expect(linha.payload.service_boundary).toEqual(FRONTEIRA);
    expect(linha.payload.conversation_id).toBe(FRONTEIRA.conversation_id);
  });
});
