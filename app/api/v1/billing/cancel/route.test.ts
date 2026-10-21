import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { deleteSubscription } from "@/lib/asaas";
import { requireRole } from "@/lib/auth/require-role";
import { getOrganizationBilling, type OrganizationBilling } from "@/lib/billing";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { POST } from "./route";

const banco = vi.hoisted(() => ({
  criar: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/billing", () => ({ getOrganizationBilling: vi.fn() }));
vi.mock("@/lib/asaas", () => ({ deleteSubscription: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: banco.criar }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const SUB_ID = "30000000-0000-4000-8000-000000000003";
const ATUALIZADO_EM = "2026-10-16T12:00:00.000Z";
const ACESSO_ATE = "2026-11-16T12:00:00.000Z";

function assinatura(override: Partial<OrganizationBilling> = {}): OrganizationBilling {
  return {
    subscription_id: SUB_ID,
    updated_at: ATUALIZADO_EM,
    organization_id: ORG_ID,
    plan_name: "Impulso",
    plan_slug: "impulso",
    limits: { whatsapp: 3, pipelines: 5 },
    status: "active",
    current_period_end: ACESSO_ATE,
    asaas_subscription_id: "sub_assinatura_atual",
    is_active: true,
    seats: 3,
    billing_cycle: "monthly",
    ...override,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: {
      id: USER_ID,
      email: "administrador@example.invalid",
      full_name: null,
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR",
      organizations: [{ organization_id: ORG_ID, organization_name: "Empresa", role: "admin" }],
    },
    org: { orgId: ORG_ID, name: "Empresa", role: "admin" },
  });
  vi.mocked(getOrganizationBilling).mockResolvedValue({ ok: true, billing: assinatura() });
  vi.mocked(deleteSubscription).mockResolvedValue({ ok: true, deleted: true });
  vi.mocked(audit).mockResolvedValue(undefined);
  banco.criar.mockReturnValue({ from: banco.from });
  const query = { update: banco.update, eq: banco.eq, select: banco.select };
  banco.from.mockReturnValue(query);
  banco.update.mockReturnValue(query);
  banco.eq.mockReturnValue(query);
  banco.select.mockResolvedValue({ data: [{ id: SUB_ID }], error: null });
});

describe("POST /api/v1/billing/cancel", () => {
  it("recusa acompanhamento somente leitura antes da autorização e de qualquer efeito", async () => {
    const recusado = fail("forbidden", "Este acompanhamento permite somente leitura.", 403);
    vi.mocked(requireSupportWrite).mockResolvedValueOnce(recusado);

    expect(await POST()).toBe(recusado);
    expect(requireRole).not.toHaveBeenCalled();
    expect(getOrganizationBilling).not.toHaveBeenCalled();
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(banco.criar).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("repassa a recusa de papel antes de consultar ou cancelar a assinatura", async () => {
    const recusado = fail("forbidden_role", "Papel insuficiente.", 403);
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: false, response: recusado });

    expect(await POST()).toBe(recusado);
    expect(requireRole).toHaveBeenCalledWith("admin", {
      requestId: expect.any(String),
      resource: "subscription",
    });
    expect(getOrganizationBilling).not.toHaveBeenCalled();
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(banco.criar).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("repetir cancelamento concluído conserva o período sem outra chamada ao Asaas ou escrita", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValueOnce({
      ok: true,
      billing: assinatura({ status: "canceled" }),
    });

    const resposta = await POST();

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ data: { access_until: ACESSO_ATE } });
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(banco.criar).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("cancela somente a assinatura da organização autorizada e preserva o período contratado", async () => {
    const resposta = await POST();

    expect(resposta.status).toBe(200);
    expect(getOrganizationBilling).toHaveBeenCalledExactlyOnceWith(ORG_ID);
    expect(deleteSubscription).toHaveBeenCalledExactlyOnceWith("sub_assinatura_atual");
    expect(banco.from).toHaveBeenCalledExactlyOnceWith("subscriptions");
    expect(banco.eq.mock.calls).toEqual([
      ["organization_id", ORG_ID],
      ["id", SUB_ID],
      ["updated_at", ATUALIZADO_EM],
    ]);
    expect(banco.update).toHaveBeenCalledExactlyOnceWith({
      status: "canceled",
      canceled_at: expect.any(String),
      updated_at: expect.any(String),
    });
    // A escrita não altera plano, atendentes ou fim do período já contratado.
    expect(Object.keys(banco.update.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "canceled_at",
      "status",
      "updated_at",
    ]);
    expect(await resposta.json()).toEqual({ data: { access_until: ACESSO_ATE } });
    expect(audit).toHaveBeenCalledExactlyOnceWith({
      action: "billing.subscription_canceled",
      actorUserId: USER_ID,
      organizationId: ORG_ID,
      resourceType: "subscription",
      resourceId: SUB_ID,
      requestId: resposta.headers.get("X-Request-Id"),
      bypassedRls: true,
    });
  });

  it.each(["suspended", "past_due", "pending"])(
    "cancelar recorrência em %s mantém a restrição e não reativa acesso",
    async (status) => {
      vi.mocked(getOrganizationBilling).mockResolvedValueOnce({
        ok: true,
        billing: assinatura({ status, is_active: false }),
      });

      const resposta = await POST();

      expect(resposta.status).toBe(200);
      expect(deleteSubscription).toHaveBeenCalledExactlyOnceWith("sub_assinatura_atual");
      expect(banco.update).toHaveBeenCalledWith(expect.objectContaining({ status }));
      expect(await resposta.json()).toEqual({ data: { access_until: null } });
      expect(audit).toHaveBeenCalledTimes(1);
    },
  );

  it("não chama Asaas quando a assinatura não possui recorrência externa", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValueOnce({
      ok: true,
      billing: assinatura({ asaas_subscription_id: null }),
    });

    expect((await POST()).status).toBe(200);
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(banco.update).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: [], error: null },
    { data: null, error: { message: "falha privada do banco" } },
  ])(
    "falha 503 sem auditar sucesso se a confirmação local não atualiza uma linha",
    async (resultado) => {
      banco.select.mockResolvedValueOnce(resultado);

      const resposta = await POST();

      expect(resposta.status).toBe(503);
      expect(await resposta.json()).toEqual({
        error: {
          code: "billing_unavailable",
          message:
            "A recorrência foi cancelada, mas a confirmação local mudou durante a operação. Atualize a página para conferir.",
        },
      });
      expect(deleteSubscription).toHaveBeenCalledTimes(1);
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it("falha do Asaas responde 503 sem expor credenciais e sem confirmar cancelamento no banco", async () => {
    const detalhePrivado = "access_token=segredo-ficticio; resposta privada do provedor";
    vi.mocked(deleteSubscription).mockRejectedValueOnce(new Error(detalhePrivado));

    const resposta = await POST();
    const corpo = await resposta.text();

    expect(resposta.status).toBe(503);
    expect(JSON.parse(corpo)).toEqual({
      error: {
        code: "upstream_unavailable",
        message:
          "Não foi possível confirmar o cancelamento. Confira Plano e cobrança antes de tentar novamente.",
      },
    });
    expect(corpo).not.toContain(detalhePrivado);
    expect(corpo).not.toContain("segredo-ficticio");
    expect(banco.criar).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("falha ao ler a assinatura impede cancelamento externo", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValueOnce({
      ok: false,
      reason: "consulta_indisponivel",
    });

    const resposta = await POST();

    expect(resposta.status).toBe(503);
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(banco.criar).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("assinatura ausente responde 404 sem cancelar outro contrato", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValueOnce({ ok: true, billing: null });

    expect((await POST()).status).toBe(404);
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(banco.criar).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([{ subscription_id: undefined }, { updated_at: null }])(
    "identidade ou versão local ausente impede cancelamento externo",
    async (incompleto) => {
      vi.mocked(getOrganizationBilling).mockResolvedValueOnce({
        ok: true,
        billing: assinatura(incompleto),
      });

      expect((await POST()).status).toBe(503);
      expect(deleteSubscription).not.toHaveBeenCalled();
      expect(banco.criar).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );
});
