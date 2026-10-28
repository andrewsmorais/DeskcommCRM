/**
 * GET  /api/v1/admin/tenants/[id]/plano — o plano da organização e os limites em vigor
 * POST /api/v1/admin/tenants/[id]/plano — ATIVA O ESCALA com os números da proposta
 *
 * O Escala não passa pelo checkout da página de vendas ("Falar com
 * especialista"): o dono da plataforma conversa com o cliente, fecha a
 * proposta e ativa aqui. Grava a assinatura única da organização
 * (`subscriptions`, único por organization_id) com `plan_type = 'escala'`, o
 * período, o valor mensal combinado (para o MRR) e os números da proposta
 * (`limites_personalizados`, migration 0492 — nunca abaixo do pacote base).
 *
 * Só super-admin (requirePlatformAdmin, com MFA quando a política exige).
 * Recusa por cima de uma assinatura do Asaas em vigor sem confirmação
 * explícita: o Asaas continuaria cobrando o plano antigo.
 */
import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { getOrganizationBilling } from "@/lib/billing";
import { PLANOS_COMERCIAIS, limitesEfetivos } from "@/lib/billing/catalogo";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base = PLANOS_COMERCIAIS.escala;
const minimo = (n: number) => z.number().int().min(n).max(1000);

const bodySchema = z.object({
  /** Até quando o Escala fica ativo (renovação manual, como a proposta). */
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD"),
  /** Valor mensal combinado, em centavos — alimenta o MRR do painel. */
  valor_mensal_cents: z.number().int().min(0).max(100_000_000),
  limites: z.object({
    whatsapp: minimo(base.whatsapp),
    agentes_ia: minimo(base.agentes_ia),
    chatbots: minimo(base.chatbots),
    pipelines: minimo(base.pipelines),
    usuarios: minimo(base.usuarios),
  }),
  /** Confirma substituir uma assinatura do Asaas ainda em vigor. */
  substituir_assinatura_asaas: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  const admin = createAdminClient();
  const [leitura, { data: assinatura, error }] = await Promise.all([
    getOrganizationBilling(id),
    admin
      .from("subscriptions")
      .select(
        "plan_type, status, current_period_end, asaas_subscription_id, contracted_amount_cents, limites_personalizados",
      )
      .eq("organization_id", id)
      .maybeSingle(),
  ]);
  if (error || !leitura.ok)
    return fail("billing_unavailable", "Não foi possível ler o plano.", 503, { requestId });
  return ok(
    {
      assinatura: assinatura
        ? {
            plano: assinatura.plan_type,
            status: assinatura.status,
            ate: assinatura.current_period_end,
            no_asaas: Boolean(assinatura.asaas_subscription_id),
            valor_mensal_cents: assinatura.contracted_amount_cents,
          }
        : null,
      ativo: leitura.billing?.is_active ?? false,
      limites: leitura.billing?.limits ?? null,
      pacote_base_escala: limitesEfetivos("escala", null),
    },
    { requestId },
  );
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supportDenied = await requireSupportWrite(id);
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Confira os números da proposta.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const body = parsed.data;
  const fim = new Date(`${body.ate}T23:59:59-03:00`);
  if (Number.isNaN(fim.getTime()) || fim.getTime() <= Date.now()) {
    return fail("validation_failed", "A data final precisa ser no futuro.", 422, { requestId });
  }

  const admin = createAdminClient();
  const [{ data: org }, { data: plano }, { data: atual, error: erroAtual }] = await Promise.all([
    admin.from("organizations").select("id, slug").eq("id", id).maybeSingle(),
    admin.from("plans").select("id").eq("slug", "escala").maybeSingle(),
    admin
      .from("subscriptions")
      .select("id, plan_type, status, asaas_subscription_id, current_period_end")
      .eq("organization_id", id)
      .maybeSingle(),
  ]);
  if (!org) return fail("not_found", "Organização não encontrada.", 404, { requestId });
  if (!plano)
    return fail("internal_error", "O plano Escala não está no catálogo.", 500, { requestId });
  if (erroAtual)
    return fail("internal_error", "Não foi possível ler a assinatura.", 500, { requestId });

  const asaasEmVigor =
    atual?.asaas_subscription_id &&
    ["active", "trialing", "past_due"].includes(String(atual.status)) &&
    atual.plan_type !== "escala";
  if (asaasEmVigor && !body.substituir_assinatura_asaas) {
    return fail(
      "state_conflict",
      "Esta organização tem uma assinatura em vigor no Asaas. Cancele a cobrança lá antes, ou confirme a substituição — senão o Asaas continua cobrando o plano antigo.",
      409,
      { requestId, details: { plano_atual: atual?.plan_type } },
    );
  }

  const agora = new Date().toISOString();
  const linha = {
    organization_id: id,
    plan_id: plano.id,
    plan_type: "escala",
    status: "active",
    billing_cycle: "monthly",
    seats: body.limites.usuarios,
    current_period_start: agora,
    current_period_end: fim.toISOString(),
    canceled_at: null,
    // Desliga do Asaas: o Escala é cobrado pela proposta, não pela assinatura
    // automática. Sem isso, um webhook da assinatura antiga reescreveria a linha.
    asaas_subscription_id: null,
    contracted_amount_cents: body.valor_mensal_cents,
    contracted_currency: "BRL",
    contracted_at: agora,
    price_source: "proposta_escala",
    limites_personalizados: body.limites,
    updated_at: agora,
  };
  const { error } = await admin
    .from("subscriptions")
    .upsert(linha, { onConflict: "organization_id" });
  if (error) return fail("internal_error", "Não foi possível ativar o Escala.", 500, { requestId });

  void audit({
    action: "billing.escala_ativado",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: id,
    resourceType: "subscription",
    resourceId: id,
    requestId,
    metadata: {
      plano_anterior: atual?.plan_type ?? null,
      ate: fim.toISOString(),
      valor_mensal_cents: body.valor_mensal_cents,
      limites: body.limites,
      substituiu_asaas: Boolean(asaasEmVigor),
    },
  });

  return ok(
    { organization_id: id, plano: "escala", ate: fim.toISOString(), limites: body.limites },
    { requestId },
  );
}
