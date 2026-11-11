import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { limitesEfetivos, planoComercial, type LimiteDoPlano } from "@/lib/billing/catalogo";
import { planoEmVigor } from "@/lib/billing/troca-de-plano";

/** Troca de plano pedida pelo cliente e ainda não aplicada (0508). */
export interface TrocaDePlano {
  plano: string;
  tipo: "upgrade" | "downgrade";
  efetiva_em: string | null;
  valor_cents: number | null;
  link: string | null;
  pedida_em: string | null;
  /** Upgrade: a cobrança avulsa da diferença no Asaas. */
  pagamento_id: string | null;
}

export interface OrganizationBilling {
  subscription_id?: string;
  updated_at?: string | null;
  organization_id: string;
  plan_name: string;
  plan_slug: string;
  limits: Partial<Record<LimiteDoPlano | "sectors", number>>;
  status: string;
  current_period_end: string | null;
  asaas_subscription_id: string | null;
  is_active: boolean;
  seats: number;
  billing_cycle: string;
  current_period_start?: string | null;
  canceled_at?: string | null;
  /** O plano gravado na assinatura (pode diferir de `plan_slug` num downgrade já vencido). */
  plan_type?: string | null;
  troca?: TrocaDePlano | null;
}

export type BillingReadResult =
  | { ok: true; billing: OrganizationBilling | null }
  | { ok: false; reason: "consulta_indisponivel" | "plano_desconhecido" };

function leituraIndisponivel(
  reason: "consulta_indisponivel" | "plano_desconhecido",
): BillingReadResult {
  // Sem e-mail, identificador de pagamento ou detalhes de transporte no log.
  logger.warn("[billing] não foi possível confirmar o plano da organização", { reason });
  return { ok: false, reason };
}

/** A organização vem do vínculo validado, nunca de query string ou formulário. */
export async function getOrganizationBilling(orgId: string): Promise<BillingReadResult> {
  try {
    const supabase = createAdminClient();
    // A view antiga mistura assinaturas e só resolve catálogo por plan_id. O
    // checkout também grava plan_type: o mesmo registro deve alimentar nome,
    // limites, situação e ciclo, inclusive quando há histórico de assinaturas.
    const { data: assinatura, error } = await supabase
      .from("subscriptions")
      .select(
        "id, updated_at, organization_id, plan_id, plan_type, status, current_period_start, current_period_end, canceled_at, asaas_subscription_id, seats, billing_cycle, limites_personalizados, troca_plano, troca_tipo, troca_efetiva_em, troca_valor_cents, troca_link, troca_pedida_em, troca_pagamento_id",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return leituraIndisponivel("consulta_indisponivel");
    // Instalações sem assinatura continuam sem contrato comercial obrigatório.
    if (!assinatura) return { ok: true, billing: null };

    let plano: { name: string; slug: string; limits: OrganizationBilling["limits"] } | null = null;
    // Downgrade agendado vale no fim do período, mesmo antes de o webhook da
    // renovação consolidar a troca na assinatura (lib/billing/troca-de-plano.ts).
    const emVigor = planoEmVigor(assinatura);
    if (assinatura.plan_id && emVigor === assinatura.plan_type) {
      const res = await supabase
        .from("plans")
        .select("name, slug, limits")
        .eq("id", assinatura.plan_id)
        .maybeSingle();
      if (res.error) return leituraIndisponivel("consulta_indisponivel");
      plano = res.data;
    }
    if (!plano && emVigor) {
      // Catálogo global; não é tabela tenant-aware. Nenhum preço é duplicado aqui.
      const res = await supabase
        .from("plans")
        .select("name, slug, limits")
        .eq("slug", emVigor)
        .maybeSingle();
      if (res.error) return leituraIndisponivel("consulta_indisponivel");
      plano = res.data;
    }
    if (
      !plano?.name ||
      !plano.slug ||
      !plano.limits ||
      typeof plano.limits !== "object" ||
      Array.isArray(plano.limits)
    ) {
      return leituraIndisponivel("plano_desconhecido");
    }

    const slug = planoComercial(plano.slug);
    if (!slug || !Number.isInteger(assinatura.seats) || assinatura.seats < 1) {
      return leituraIndisponivel("plano_desconhecido");
    }

    // Datas limitam o acesso mesmo se um webhook de atraso não chegar.
    const isActive =
      (assinatura.status === "active" &&
        Boolean(assinatura.current_period_end) &&
        Date.parse(assinatura.current_period_end) > Date.now()) ||
      (assinatura.status === "trialing" &&
        Boolean(assinatura.current_period_end) &&
        Date.parse(assinatura.current_period_end) > Date.now()) ||
      (assinatura.status === "canceled" &&
        Boolean(assinatura.current_period_end) &&
        Date.parse(assinatura.current_period_end) > Date.now());
    return {
      ok: true,
      billing: {
        subscription_id: assinatura.id,
        updated_at: assinatura.updated_at,
        organization_id: orgId,
        plan_name: plano.name,
        plan_slug: plano.slug,
        limits: {
          ...plano.limits,
          // A promessa da página mora no catálogo, não no JSON da tabela `plans`.
          ...limitesEfetivos(slug, assinatura.limites_personalizados),
        },
        status: assinatura.status,
        current_period_end: assinatura.current_period_end,
        asaas_subscription_id: assinatura.asaas_subscription_id,
        is_active: isActive,
        seats: assinatura.seats,
        billing_cycle: assinatura.billing_cycle || "monthly",
        current_period_start: assinatura.current_period_start ?? null,
        canceled_at: assinatura.canceled_at ?? null,
        plan_type: assinatura.plan_type ?? null,
        troca:
          assinatura.troca_plano &&
          (assinatura.troca_tipo === "upgrade" || assinatura.troca_tipo === "downgrade") &&
          emVigor !== assinatura.troca_plano
            ? {
                plano: assinatura.troca_plano,
                tipo: assinatura.troca_tipo,
                efetiva_em: assinatura.troca_efetiva_em ?? null,
                valor_cents: assinatura.troca_valor_cents ?? null,
                link: assinatura.troca_link ?? null,
                pedida_em: assinatura.troca_pedida_em ?? null,
                pagamento_id: assinatura.troca_pagamento_id ?? null,
              }
            : null,
      },
    };
  } catch {
    return leituraIndisponivel("consulta_indisponivel");
  }
}

export function canUse(
  billing: OrganizationBilling | null,
  recurso: LimiteDoPlano | "sectors",
  quantidadeAtual: number,
): { ok: boolean; limite: number } {
  if (
    !billing ||
    !billing.is_active ||
    !billing.limits ||
    !Number.isInteger(quantidadeAtual) ||
    quantidadeAtual < 0
  ) {
    return { ok: false, limite: 0 };
  }

  const limit = billing.limits[recurso];

  if (limit === -1) {
    return { ok: true, limite: -1 };
  }
  // Ausência ou dado inválido não significa permissão ilimitada.
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0) {
    return { ok: false, limite: 0 };
  }
  return { ok: quantidadeAtual < limit, limite: limit };
}
