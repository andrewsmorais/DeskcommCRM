import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import {
  apagarCobranca,
  atualizarValorDaAssinatura,
  clienteDaAssinatura,
  criarCobrancaAvulsa,
} from "@/lib/asaas";
import { requireRole } from "@/lib/auth/require-role";
import { getOrganizationBilling, type OrganizationBilling } from "@/lib/billing";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { DELETE, POST } from "./route";

const banco = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  filtros: [] as Array<[string, unknown]>,
  linhasAfetadas: 1,
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/billing", () => ({ getOrganizationBilling: vi.fn() }));
vi.mock("@/lib/asaas", () => ({
  apagarCobranca: vi.fn(),
  atualizarValorDaAssinatura: vi.fn(),
  clienteDaAssinatura: vi.fn(),
  criarCobrancaAvulsa: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "plans") {
        return {
          select: () => ({
            in: async (_c: string, slugs: string[]) => ({
              data: [
                {
                  id: "p-ess",
                  slug: "essencial",
                  price_monthly: 8990,
                  price_quarterly: 24273,
                  price_yearly: 86304,
                },
                {
                  id: "p-imp",
                  slug: "impulso",
                  price_monthly: 14990,
                  price_quarterly: 40473,
                  price_yearly: 143904,
                },
              ].filter((p) => slugs.includes(p.slug)),
              error: null,
            }),
          }),
        };
      }
      const q: Record<string, unknown> = {};
      q.update = (campos: Record<string, unknown>) => {
        banco.updates.push(campos);
        return q;
      };
      q.eq = (col: string, v: unknown) => {
        banco.filtros.push([col, v]);
        return q;
      };
      q.select = async () => ({
        data: Array.from({ length: banco.linhasAfetadas }, () => ({ id: SUB_ID })),
        error: null,
      });
      return q;
    },
  }),
}));

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const SUB_ID = "30000000-0000-4000-8000-000000000003";
const ATUALIZADO_EM = "2026-11-10T12:00:00.000Z";

function assinatura(o: Partial<OrganizationBilling> = {}): OrganizationBilling {
  const agora = Date.now();
  return {
    subscription_id: SUB_ID,
    updated_at: ATUALIZADO_EM,
    organization_id: ORG_ID,
    plan_name: "Essencial",
    plan_slug: "essencial",
    plan_type: "essencial",
    limits: {},
    status: "active",
    current_period_start: new Date(agora - 15 * 86_400_000).toISOString(),
    current_period_end: new Date(agora + 15 * 86_400_000).toISOString(),
    canceled_at: null,
    asaas_subscription_id: "sub_recorrencia",
    is_active: true,
    seats: 1,
    billing_cycle: "monthly",
    troca: null,
    ...o,
  };
}

const pedir = (plano: unknown) =>
  POST(
    new Request("http://x/api/v1/billing/trocar-plano", {
      method: "POST",
      body: JSON.stringify({ plano }),
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  banco.updates = [];
  banco.filtros = [];
  banco.linhasAfetadas = 1;
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER_ID, idioma: "pt-BR" },
    org: { orgId: ORG_ID, name: "Empresa", role: "admin" },
  } as never);
  vi.mocked(getOrganizationBilling).mockResolvedValue({ ok: true, billing: assinatura() });
  vi.mocked(clienteDaAssinatura).mockResolvedValue("cus_cliente");
  vi.mocked(criarCobrancaAvulsa).mockResolvedValue({
    id: "pay_diferenca",
    link: "https://www.asaas.com/i/diferenca",
  });
  vi.mocked(atualizarValorDaAssinatura).mockResolvedValue(undefined);
  vi.mocked(apagarCobranca).mockResolvedValue(undefined);
});

describe("POST /api/v1/billing/trocar-plano", () => {
  it("upgrade: cria a cobrança da diferença e NÃO troca o plano antes do pagamento", async () => {
    const res = await pedir("impulso");
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Record<string, unknown> };
    expect(corpo.data).toMatchObject({
      tipo: "upgrade",
      aplicado_agora: false,
      valor_cents: 3000,
      link: "https://www.asaas.com/i/diferenca",
    });
    expect(criarCobrancaAvulsa).toHaveBeenCalledWith(
      expect.objectContaining({
        cliente: "cus_cliente",
        valorCents: 3000,
        referencia: `troca:${SUB_ID}`,
      }),
    );
    // A recorrência só muda quando o webhook confirma o pagamento.
    expect(atualizarValorDaAssinatura).not.toHaveBeenCalled();
    expect(banco.updates[0]).toMatchObject({
      troca_plano: "impulso",
      troca_tipo: "upgrade",
      troca_pagamento_id: "pay_diferenca",
      troca_valor_cents: 3000,
    });
    expect(banco.updates[0]).not.toHaveProperty("plan_type");
    expect(banco.filtros).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG_ID],
        ["id", SUB_ID],
        ["updated_at", ATUALIZADO_EM],
      ]),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "billing.plan_change_requested", organizationId: ORG_ID }),
    );
  });

  it("downgrade: agenda para o fim do período e a próxima cobrança sai com o valor menor", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValue({
      ok: true,
      billing: assinatura({ plan_slug: "impulso", plan_type: "impulso", plan_name: "Impulso" }),
    });
    const res = await pedir("essencial");
    expect(res.status).toBe(200);
    expect(atualizarValorDaAssinatura).toHaveBeenCalledWith("sub_recorrencia", 8990);
    expect(criarCobrancaAvulsa).not.toHaveBeenCalled();
    expect(banco.updates[0]).toMatchObject({ troca_plano: "essencial", troca_tipo: "downgrade" });
    expect(banco.updates[0]).not.toHaveProperty("plan_type");
  });

  it("no teste: troca na hora, e a primeira cobrança já sai com o valor novo", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValue({
      ok: true,
      billing: assinatura({ status: "trialing" }),
    });
    const res = await pedir("impulso");
    expect(res.status).toBe(200);
    expect(atualizarValorDaAssinatura).toHaveBeenCalledWith("sub_recorrencia", 14990);
    expect(banco.updates[0]).toMatchObject({
      plan_type: "impulso",
      plan_id: "p-imp",
      contracted_amount_cents: 14990,
      price_source: "catalogo",
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.plan_changed" }));
  });

  it("o banco recusa (assinatura mudou): a cobrança criada é apagada", async () => {
    banco.linhasAfetadas = 0;
    const res = await pedir("impulso");
    expect(res.status).toBe(409);
    expect(apagarCobranca).toHaveBeenCalledWith("pay_diferenca");
  });

  it("recusas: troca em andamento, Escala, plano inválido, suporte", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValueOnce({
      ok: true,
      billing: assinatura({
        troca: {
          plano: "impulso",
          tipo: "upgrade",
          efetiva_em: null,
          valor_cents: 3000,
          link: null,
          pedida_em: null,
          pagamento_id: "pay_x",
        },
      }),
    });
    expect((await pedir("impulso")).status).toBe(409);
    expect((await pedir("escala")).status).toBe(422);
    expect((await pedir("qualquer")).status).toBe(422);
    vi.mocked(requireSupportWrite).mockResolvedValueOnce(
      new Response(null, { status: 403 }) as never,
    );
    expect((await pedir("impulso")).status).toBe(403);
    expect(criarCobrancaAvulsa).not.toHaveBeenCalled();
  });

  it("Asaas fora do ar: nada é gravado", async () => {
    vi.mocked(criarCobrancaAvulsa).mockRejectedValue(new Error("asaas_payment_failed"));
    const res = await pedir("impulso");
    expect(res.status).toBe(503);
    expect(banco.updates).toHaveLength(0);
  });
});

describe("DELETE /api/v1/billing/trocar-plano", () => {
  it("desistir do upgrade apaga a cobrança e limpa a troca", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValue({
      ok: true,
      billing: assinatura({
        troca: {
          plano: "impulso",
          tipo: "upgrade",
          efetiva_em: null,
          valor_cents: 3000,
          link: null,
          pedida_em: null,
          pagamento_id: "pay_diferenca",
        },
      }),
    });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(apagarCobranca).toHaveBeenCalledWith("pay_diferenca");
    expect(banco.updates[0]).toMatchObject({ troca_plano: null, troca_tipo: null });
    expect(banco.filtros).toEqual(
      expect.arrayContaining([["troca_pagamento_id", "pay_diferenca"]]),
    );
  });

  it("cobrança já paga: não limpa nada e avisa", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValue({
      ok: true,
      billing: assinatura({
        troca: {
          plano: "impulso",
          tipo: "upgrade",
          efetiva_em: null,
          valor_cents: 3000,
          link: null,
          pedida_em: null,
          pagamento_id: "pay_diferenca",
        },
      }),
    });
    vi.mocked(apagarCobranca).mockRejectedValue(new Error("asaas_delete_failed"));
    const res = await DELETE();
    expect(res.status).toBe(409);
    expect(banco.updates).toHaveLength(0);
  });

  it("desistir do downgrade volta a recorrência ao valor do plano que fica", async () => {
    vi.mocked(getOrganizationBilling).mockResolvedValue({
      ok: true,
      billing: assinatura({
        plan_slug: "impulso",
        plan_type: "impulso",
        troca: {
          plano: "essencial",
          tipo: "downgrade",
          efetiva_em: "2026-12-01T00:00:00.000Z",
          valor_cents: null,
          link: null,
          pedida_em: null,
          pagamento_id: null,
        },
      }),
    });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(atualizarValorDaAssinatura).toHaveBeenCalledWith("sub_recorrencia", 14990);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "billing.plan_change_canceled" }),
    );
  });
});
