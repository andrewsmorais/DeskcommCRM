/**
 * GET/POST /api/v1/cron/troca-de-plano-vencida — aplica na assinatura a DESCIDA
 * de plano que o cliente agendou, no dia em que ela passa a valer.
 *
 * O acesso já mudava na data (`planoEmVigor`, lib/billing/troca-de-plano.ts),
 * mas a assinatura só passava a dizer o plano novo quando o webhook da página
 * de vendas recebia a renovação paga. Sem renovação paga no dia (boleto que
 * atrasa, Pix que não veio), o e-mail de "plano reduzido" não saía, e o
 * cliente ficava sem saber que a troca valeu. Esta rodada fecha esse buraco:
 * na data, grava o plano novo — o gatilho do banco (`plano.alterado`) manda o
 * e-mail — e limpa o pedido.
 *
 * A escrita tem trava otimista no PEDIDO (`troca_tipo` + `troca_plano` +
 * `troca_efetiva_em` iguais aos lidos): se o webhook consolidou antes, ou o
 * cliente desistiu, nada é mexido. O preço do ciclo vem da tabela `plans`,
 * a mesma que o checkout cobra. Números combinados de um Escala antigo
 * (`limites_personalizados`) não sobrevivem à descida.
 *
 * Auth: mesmo contrato dos demais crons. Audita SÓ quando aplicou algo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { cicloValido, ehPlanoTrocavel, precoDoCiclo } from "@/lib/billing/troca-de-plano";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Teto por rodada; o que sobrar entra na próxima. */
const LIMITE = 200;

export interface TrocasVencidasResultado {
  examinadas: number;
  aplicadas: number;
  falhas: number;
}

type LinhaDaTroca = {
  id: string;
  organization_id: string;
  billing_cycle: string | null;
  troca_plano: string | null;
  troca_efetiva_em: string | null;
};

type PlanoDoCatalogo = {
  id: string;
  slug: string;
  price_monthly: number;
  price_quarterly: number | null;
  price_yearly: number | null;
};

export async function aplicarTrocasVencidas(
  admin: SupabaseClient,
  requestId: string,
  agora: Date = new Date(),
): Promise<TrocasVencidasResultado> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, organization_id, billing_cycle, troca_plano, troca_efetiva_em")
    .eq("troca_tipo", "downgrade")
    .not("troca_efetiva_em", "is", null)
    .lte("troca_efetiva_em", agora.toISOString())
    .order("troca_efetiva_em", { ascending: true })
    .limit(LIMITE);
  if (error) throw new Error(`subscriptions: ${error.message}`);
  const linhas = (data ?? []) as LinhaDaTroca[];
  if (linhas.length === 0) return { examinadas: 0, aplicadas: 0, falhas: 0 };

  const { data: planos, error: erroDosPlanos } = await admin
    .from("plans")
    .select("id, slug, price_monthly, price_quarterly, price_yearly");
  if (erroDosPlanos) throw new Error(`plans: ${erroDosPlanos.message}`);
  const porSlug = new Map(((planos ?? []) as PlanoDoCatalogo[]).map((p) => [p.slug, p]));

  let aplicadas = 0;
  let falhas = 0;
  for (const linha of linhas) {
    const plano = ehPlanoTrocavel(linha.troca_plano) ? porSlug.get(linha.troca_plano) : undefined;
    if (!plano || !cicloValido(linha.billing_cycle) || !(plano.price_monthly > 0)) {
      falhas++;
      logger.error("[troca-de-plano-vencida] pedido sem plano ou ciclo conhecido", {
        subscription_id: linha.id,
        organization_id: linha.organization_id,
        requestId,
      });
      continue;
    }
    const agoraIso = new Date().toISOString();
    const { data: escritas, error: erroDaEscrita } = await admin
      .from("subscriptions")
      .update({
        plan_id: plano.id,
        plan_type: plano.slug,
        contracted_amount_cents: precoDoCiclo(plano, linha.billing_cycle),
        contracted_at: agoraIso,
        price_source: "catalogo",
        limites_personalizados: null,
        troca_plano: null,
        troca_tipo: null,
        troca_efetiva_em: null,
        troca_pagamento_id: null,
        troca_valor_cents: null,
        troca_link: null,
        troca_pedida_em: null,
        updated_at: agoraIso,
      })
      .eq("organization_id", linha.organization_id)
      .eq("id", linha.id)
      .eq("troca_tipo", "downgrade")
      .eq("troca_plano", linha.troca_plano!)
      .eq("troca_efetiva_em", linha.troca_efetiva_em!)
      .select("id");
    if (erroDaEscrita) {
      falhas++;
      logger.error("[troca-de-plano-vencida] escrita falhou", {
        subscription_id: linha.id,
        organization_id: linha.organization_id,
        error: erroDaEscrita.message,
        requestId,
      });
      continue;
    }
    // Lista vazia = o webhook consolidou antes, ou o cliente desistiu: certo.
    if (Array.isArray(escritas) && escritas.length > 0) {
      aplicadas++;
      void audit({
        action: "billing.plan_changed",
        organizationId: linha.organization_id,
        resourceType: "subscription",
        resourceId: linha.id,
        metadata: { para: plano.slug, tipo: "downgrade", motivo: "data_da_troca" },
        requestId,
        bypassedRls: true,
      });
    }
  }
  return { examinadas: linhas.length, aplicadas, falhas };
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }
  let resultado: TrocasVencidasResultado;
  try {
    resultado = await aplicarTrocasVencidas(createAdminClient(), requestId);
  } catch (err) {
    logger.error("[troca-de-plano-vencida] varredura falhou", {
      error: err instanceof Error ? err.message : String(err),
      requestId,
    });
    return fail("internal_error", "Failed to scan plan changes.", 500, { requestId });
  }
  if (resultado.aplicadas > 0 || resultado.falhas > 0) {
    void audit({
      action: "billing.plan_change_due_run",
      organizationId: null,
      bypassedRls: true,
      metadata: { ...resultado },
      requestId,
    });
  }
  return ok(resultado, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
