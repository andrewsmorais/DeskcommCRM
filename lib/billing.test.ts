import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn } }));

import { canUse, getOrganizationBilling, type OrganizationBilling } from "./billing";

const ORG = "org-validada";
const assinatura = {
  id: "assinatura-recente",
  updated_at: "2026-10-16T10:00:00Z",
  organization_id: ORG,
  plan_id: "plano-impulso",
  plan_type: null,
  status: "active",
  current_period_end: "2999-01-01T00:00:00.000Z",
  asaas_subscription_id: "assinatura-externa",
  seats: 10,
  billing_cycle: "monthly",
};
const plano = { name: "Impulso", slug: "impulso", limits: { whatsapp: 3, pipelines: 5 } };

function consulta(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  return q;
}

function preparar(sub: unknown = assinatura, catalogo: unknown = plano) {
  const assinaturaQuery = consulta(sub);
  const planoQuery = consulta(catalogo);
  mocks.from.mockImplementation((tabela: string) => {
    if (tabela === "subscriptions") return assinaturaQuery;
    if (tabela === "plans") return planoQuery;
    throw new Error(`Tabela inesperada: ${tabela}`);
  });
  return { assinaturaQuery, planoQuery };
}

beforeEach(() => vi.clearAllMocks());

describe("plano persistido da organização", () => {
  it("resolve por plan_id mesmo quando o checkout não gravou plan_type", async () => {
    const { assinaturaQuery, planoQuery } = preparar();
    expect(await getOrganizationBilling(ORG)).toEqual({
      ok: true,
      billing: {
        subscription_id: assinatura.id,
        updated_at: assinatura.updated_at,
        organization_id: ORG,
        plan_name: "Impulso",
        plan_slug: "impulso",
        limits: plano.limits,
        status: "active",
        current_period_end: assinatura.current_period_end,
        asaas_subscription_id: assinatura.asaas_subscription_id,
        is_active: true,
        seats: 10,
        billing_cycle: "monthly",
      },
    });
    expect(assinaturaQuery.eq).toHaveBeenCalledWith("organization_id", ORG);
    expect(assinaturaQuery.order.mock.calls).toEqual([
      ["created_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
    expect(assinaturaQuery.limit).toHaveBeenCalledWith(1);
    expect(planoQuery.eq).toHaveBeenCalledWith("id", "plano-impulso");
    expect(mocks.from).not.toHaveBeenCalledWith("organization_billing");
  });

  it("recupera o plano pelo slug gravado pelo checkout sem plan_id", async () => {
    const { planoQuery } = preparar({ ...assinatura, plan_id: null, plan_type: "impulso" });
    const result = await getOrganizationBilling(ORG);
    expect(result).toMatchObject({
      ok: true,
      billing: { plan_name: "Impulso", plan_slug: "impulso" },
    });
    expect(planoQuery.eq).toHaveBeenCalledWith("slug", "impulso");
  });

  it("prefere o plano vinculado por ID quando também existe um slug diferente", async () => {
    const { planoQuery } = preparar({ ...assinatura, plan_type: "essencial" });
    await getOrganizationBilling(ORG);
    expect(planoQuery.eq.mock.calls).toEqual([["id", "plano-impulso"]]);
  });

  it("permite reencontrar por slug quando o ID não encontra linha no catálogo", async () => {
    preparar({ ...assinatura, plan_type: "impulso" });
    const porId = consulta(null);
    const porSlug = consulta(plano);
    const subs = consulta({ ...assinatura, plan_type: "impulso" });
    mocks.from.mockReturnValueOnce(subs).mockReturnValueOnce(porId).mockReturnValueOnce(porSlug);
    expect(await getOrganizationBilling(ORG)).toMatchObject({
      ok: true,
      billing: { plan_slug: "impulso" },
    });
    expect(porSlug.eq).toHaveBeenCalledWith("slug", "impulso");
  });

  it("distingue instalação sem assinatura de falha de consulta", async () => {
    preparar(null);
    expect(await getOrganizationBilling(ORG)).toEqual({ ok: true, billing: null });
    expect(mocks.from.mock.calls).toEqual([["subscriptions"]]);
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("não converte erro de consulta em ausência de assinatura", async () => {
    const { assinaturaQuery } = preparar();
    assinaturaQuery.maybeSingle.mockResolvedValue({ data: null, error: { code: "rede" } });
    expect(await getOrganizationBilling(ORG)).toEqual({
      ok: false,
      reason: "consulta_indisponivel",
    });
  });

  it("devolve falha recuperável quando o transporte lança", async () => {
    preparar();
    mocks.from.mockImplementation(() => {
      throw new Error("transporte");
    });
    expect(await getOrganizationBilling(ORG)).toEqual({
      ok: false,
      reason: "consulta_indisponivel",
    });
  });

  it.each([
    { ...assinatura, plan_id: null, plan_type: null },
    { ...assinatura, plan_id: null, plan_type: "plano-inexistente" },
  ])("assinatura sem plano reconhecido não vira acesso ilimitado", async (sub) => {
    preparar(sub, null);
    expect(await getOrganizationBilling(ORG)).toEqual({ ok: false, reason: "plano_desconhecido" });
  });

  it("erro de catálogo não tenta adivinhar outro plano pelo slug", async () => {
    const { planoQuery } = preparar({ ...assinatura, plan_type: "impulso" });
    planoQuery.maybeSingle.mockResolvedValue({ data: null, error: { code: "rede" } });
    expect(await getOrganizationBilling(ORG)).toEqual({
      ok: false,
      reason: "consulta_indisponivel",
    });
    expect(planoQuery.eq.mock.calls).toEqual([["id", "plano-impulso"]]);
  });

  it.each([
    ["active", "2020-01-01T00:00:00.000Z", false],
    ["active", "2999-01-01T00:00:00.000Z", true],
    ["active", null, false],
    ["trialing", "2020-01-01T00:00:00.000Z", false],
    ["trialing", "2999-01-01T00:00:00.000Z", true],
    ["trialing", null, false],
    ["canceled", "2999-01-01T00:00:00.000Z", true],
    ["canceled", "2020-01-01T00:00:00.000Z", false],
    ["canceled", null, false],
    ["pending", "2999-01-01T00:00:00.000Z", false],
    ["past_due", "2999-01-01T00:00:00.000Z", false],
  ])("mantém a situação %s do contrato existente", async (status, fim, ativo) => {
    preparar({ ...assinatura, status, current_period_end: fim });
    expect(await getOrganizationBilling(ORG)).toMatchObject({
      ok: true,
      billing: { status, is_active: ativo },
    });
  });
});

describe("limites do plano", () => {
  const billing = { is_active: true, limits: { whatsapp: 3 } } as OrganizationBilling;

  it("respeita o limite numérico sem alterar contagem de recursos", () => {
    expect(canUse(billing, "whatsapp", 2)).toEqual({ ok: true, limite: 3 });
    expect(canUse(billing, "whatsapp", 3)).toEqual({ ok: false, limite: 3 });
  });

  it.each([undefined, Number.NaN, -2, 1.5, "3"])("limite inválido %s não é ilimitado", (limite) => {
    const incompleto = { ...billing, limits: { whatsapp: limite } } as OrganizationBilling;
    expect(canUse(incompleto, "whatsapp", 0)).toEqual({ ok: false, limite: 0 });
  });

  it("só -1 é ilimitado; sem assinatura continua bloqueado para canUse", () => {
    expect(canUse({ ...billing, limits: { whatsapp: -1 } }, "whatsapp", 999)).toEqual({
      ok: true,
      limite: -1,
    });
    expect(canUse(null, "whatsapp", 0)).toEqual({ ok: false, limite: 0 });
  });
});
