/**
 * GET  /api/v1/admin/tenants/[id]/plano — o plano da organização e os limites em vigor
 * POST /api/v1/admin/tenants/[id]/plano — ATIVA O ESCALA com os números da proposta
 * PATCH /api/v1/admin/tenants/[id]/plano — liga e desliga os EXTRAS cobrados à parte
 *
 * Desde 19/11/2026 o Escala se contrata pelo checkout, como os outros planos.
 * Este POST ficou para a PROPOSTA: o cliente que precisa de mais do que o
 * pacote do Escala conversa com o dono da plataforma, fecha a proposta e o
 * dono ativa aqui. Grava a assinatura única da organização
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
import { apagarCobranca, deleteSubscription } from "@/lib/asaas";
import { getOrganizationBilling } from "@/lib/billing";
import {
  LISTA_DE_EXTRAS,
  PLANOS_COMERCIAIS,
  extrasLidos,
  limitesEfetivos,
  type ExtraCobradoAParte,
} from "@/lib/billing/catalogo";

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
        "plan_type, status, current_period_end, asaas_subscription_id, contracted_amount_cents, limites_personalizados, extras",
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
            extras: extrasLidos(assinatura.extras),
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
      .select("id, plan_type, status, asaas_subscription_id, current_period_end, troca_tipo, troca_pagamento_id")
      .eq("organization_id", id)
      .maybeSingle(),
  ]);
  if (!org) return fail("not_found", "Organização não encontrada.", 404, { requestId });
  if (!plano)
    return fail("internal_error", "O plano Escala não está no catálogo.", 500, { requestId });
  if (erroAtual)
    return fail("internal_error", "Não foi possível ler a assinatura.", 500, { requestId });

  // Qualquer recorrência viva no Asaas — inclusive a de um Escala comprado no
  // checkout, que desde 19/11 é o caso comum — continuaria cobrando junto da
  // proposta. Só substitui com confirmação, e aí a recorrência é cancelada lá.
  const asaasEmVigor =
    atual?.asaas_subscription_id &&
    ["active", "trialing", "past_due"].includes(String(atual.status));
  if (asaasEmVigor && !body.substituir_assinatura_asaas) {
    return fail(
      "state_conflict",
      "Esta organização tem uma assinatura em vigor no Asaas. Cancele a cobrança lá antes, ou confirme a substituição — senão o Asaas continua cobrando o plano antigo.",
      409,
      { requestId, details: { plano_atual: atual?.plan_type } },
    );
  }

  if (asaasEmVigor && atual?.asaas_subscription_id) {
    try {
      await deleteSubscription(atual.asaas_subscription_id);
    } catch {
      return fail(
        "upstream_unavailable",
        "Não foi possível cancelar a recorrência no Asaas. Nada foi mudado; tente de novo ou cancele por lá antes.",
        503,
        { requestId },
      );
    }
  }
  // Subida pendente: a cobrança da diferença não pode ficar pagável sem troca.
  if (atual?.troca_tipo === "upgrade" && atual.troca_pagamento_id) {
    await apagarCobranca(atual.troca_pagamento_id).catch(() => undefined);
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
    price_source: "manual",
    limites_personalizados: body.limites,
    // A proposta substitui qualquer troca pedida antes (uma descida agendada
    // derrubaria o Escala na data, e a cron apagaria os números combinados).
    troca_plano: null,
    troca_tipo: null,
    troca_efetiva_em: null,
    troca_pagamento_id: null,
    troca_valor_cents: null,
    troca_link: null,
    troca_pedida_em: null,
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

const extrasSchema = z
  .object({
    extras: z
      .array(z.enum(LISTA_DE_EXTRAS as [ExtraCobradoAParte, ...ExtraCobradoAParte[]]))
      .max(LISTA_DE_EXTRAS.length),
  })
  .strict();

/**
 * Liga e desliga os extras cobrados à parte (prospecção, ligações, nota de voz).
 * Grava a lista INTEIRA (o que não vier, desliga). Só super-admin, e só numa
 * organização que já tem assinatura: extra sem plano não tem o que acompanhar.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
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
  const parsed = extrasSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Escolha os extras da lista.", 422, { requestId });
  const extras = [...new Set(parsed.data.extras)];

  const admin = createAdminClient();
  const { data: atual, error: erroAtual } = await admin
    .from("subscriptions")
    .select("id, extras")
    .eq("organization_id", id)
    .maybeSingle();
  if (erroAtual)
    return fail("internal_error", "Não foi possível ler a assinatura.", 500, { requestId });
  if (!atual)
    return fail(
      "state_conflict",
      "Esta organização ainda não tem plano. Os extras entram junto de um plano.",
      409,
      { requestId },
    );
  const { error } = await admin
    .from("subscriptions")
    .update({ extras, updated_at: new Date().toISOString() })
    .eq("organization_id", id)
    .eq("id", atual.id);
  if (error) return fail("internal_error", "Não foi possível gravar os extras.", 500, { requestId });

  void audit({
    action: "billing.extras_alterados",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: id,
    resourceType: "subscription",
    resourceId: atual.id,
    requestId,
    metadata: { antes: extrasLidos(atual.extras), depois: extras },
  });
  return ok({ organization_id: id, extras }, { requestId });
}
