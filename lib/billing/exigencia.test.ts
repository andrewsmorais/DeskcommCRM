import { describe, expect, it } from "vitest";
import type { BillingReadResult, OrganizationBilling } from "@/lib/billing";
import { canUse } from "@/lib/billing";
import { decidirAcessoPeloPlano, rotaAbertaSemAssinatura } from "./exigencia";
import { mensagemDaCotaDeAgentes } from "./cota-de-agentes";
import { enderecoDosPlanos } from "./pagina-de-planos";
import { PLANOS_COMERCIAIS } from "./catalogo";

function plano(over: Partial<OrganizationBilling> = {}): OrganizationBilling {
  return {
    organization_id: "org",
    plan_name: "Essencial",
    plan_slug: "essencial",
    limits: { whatsapp: 1, pipelines: 1, agentes_ia: 1 },
    status: "trialing",
    current_period_end: "2099-01-01T00:00:00Z",
    asaas_subscription_id: null,
    is_active: true,
    seats: 1,
    billing_cycle: "monthly",
    ...over,
  };
}
const leitura = (billing: OrganizationBilling | null): BillingReadResult => ({ ok: true, billing });

describe("quem entra sem assinatura", () => {
  it("assinatura ativa ou teste em dia entra", () => {
    expect(decidirAcessoPeloPlano(leitura(plano()), { ambiente: {} })).toEqual({
      liberado: true,
      motivo: "ativo",
    });
  });

  it("conta criada sem plano não entra", () => {
    expect(decidirAcessoPeloPlano(leitura(null), { ambiente: {} })).toEqual({
      liberado: false,
      motivo: "sem_plano",
    });
  });

  it("teste vencido ou pagamento atrasado não entra", () => {
    const r = decidirAcessoPeloPlano(leitura(plano({ is_active: false, status: "past_due" })), {
      ambiente: {},
    });
    expect(r).toEqual({ liberado: false, motivo: "vencido" });
  });

  it("super-admin e suporte passam", () => {
    expect(decidirAcessoPeloPlano(leitura(null), { isento: true, ambiente: {} }).liberado).toBe(
      true,
    );
  });

  it("leitura do plano fora do ar não derruba quem paga", () => {
    const r = decidirAcessoPeloPlano(
      { ok: false, reason: "consulta_indisponivel" },
      { ambiente: {} },
    );
    expect(r.liberado).toBe(true);
  });

  it("EXIGIR_ASSINATURA=false desliga a exigência", () => {
    expect(
      decidirAcessoPeloPlano(leitura(null), { ambiente: { EXIGIR_ASSINATURA: "false" } }).liberado,
    ).toBe(true);
  });
});

describe("telas abertas sem assinatura", () => {
  it("cobrança, perfil, segurança e a página da organização (exportar dados)", () => {
    for (const rota of [
      "/app/settings/billing",
      "/app/settings/profile",
      "/app/settings/security/mfa",
      "/app/settings/tenant",
      "/app/settings/tenant/",
    ])
      expect(rotaAbertaSemAssinatura(rota)).toBe(true);
  });

  it("o resto fecha, inclusive as filhas da organização e caminho ausente", () => {
    for (const rota of [
      "/app",
      "/app/inbox",
      "/app/ai/agents",
      "/app/settings/tenant/whatsapp",
      "/app/settings/billingx",
      null,
    ])
      expect(rotaAbertaSemAssinatura(rota)).toBe(false);
  });
});

describe("cota de agentes de IA por plano", () => {
  it("Essencial 1, Impulso 3, Escala sem limite", () => {
    expect(PLANOS_COMERCIAIS.essencial.agentes_ia).toBe(1);
    expect(PLANOS_COMERCIAIS.impulso.agentes_ia).toBe(3);
    expect(PLANOS_COMERCIAIS.escala.agentes_ia).toBe(-1);
  });

  it("Essencial com 1 agente não cria o segundo", () => {
    expect(canUse(plano(), "agentes_ia", 0).ok).toBe(true);
    expect(canUse(plano(), "agentes_ia", 1)).toEqual({ ok: false, limite: 1 });
  });

  it("Escala cria quantos quiser; sem plano não cria nenhum", () => {
    expect(
      canUse(plano({ plan_slug: "escala", limits: { agentes_ia: -1 } }), "agentes_ia", 50).ok,
    ).toBe(true);
    expect(canUse(null, "agentes_ia", 0).ok).toBe(false);
  });

  it("a mensagem diz o plano e o limite em português de gente", () => {
    expect(mensagemDaCotaDeAgentes("Essencial", 1)).toContain("permite 1 agente de IA");
    expect(mensagemDaCotaDeAgentes("Impulso", 3)).toContain("permite 3 agentes de IA");
    expect(mensagemDaCotaDeAgentes(null, 0)).toContain("Escolha um plano");
  });
});

describe("endereço da página de planos", () => {
  it("leva o org_id para a página reconhecer a conta", () => {
    expect(enderecoDosPlanos("abc", {})).toBe("https://chataionline.io/?org_id=abc#precos");
  });
  it("endereço inválido no ambiente cai no padrão", () => {
    expect(enderecoDosPlanos(null, { PAGINA_DE_PLANOS_URL: "isso não é url" })).toBe(
      "https://chataionline.io/#precos",
    );
  });
});
