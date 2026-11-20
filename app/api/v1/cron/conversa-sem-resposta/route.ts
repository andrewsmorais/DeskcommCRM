/**
 * GET/POST /api/v1/cron/conversa-sem-resposta — devolve à fila a conversa que
 * está com um atendente, tem cliente esperando e passou do prazo sem resposta.
 *
 * Só age em organização que ligou o prazo em Configurações › Atendimento
 * (`settings.routing.unanswered_return_after_minutes`); sem isso nada acontece.
 * A regra pura mora em `lib/routing/sem-resposta.ts`.
 *
 * A saída da conversa é `fn_conversation_assign(..., null, 'release', <dono>, true)`:
 * a MESMA função da liberação manual, com a trava "só se o dono ainda é este" —
 * se a pessoa respondeu ou a conversa mudou de mãos entre a leitura e a escrita,
 * nada é mexido. Depois pede o roteamento, que escolhe de novo conforme o modo
 * da organização (no manual, a conversa fica na fila aberta).
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET).
 * Audita SÓ quando devolveu algo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import {
  lerPrazoSemRespostaMinutos,
  selecionarSemResposta,
  type ConversaComDono,
} from "@/lib/routing/sem-resposta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Teto de conversas lidas por rodada; o que sobrar entra na próxima. */
const SCAN_LIMIT = 500;

export interface SemRespostaResultado {
  organizacoes: number;
  examinadas: number;
  devolvidas: number;
  falhas: number;
}

async function prazosPorOrganizacao(admin: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from("organizations")
    .select("id, settings")
    .not("settings->routing->unanswered_return_after_minutes", "is", null);
  if (error) throw new Error(`organizations: ${error.message}`);
  const prazos = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ id: string; settings: unknown }>) {
    const minutos = lerPrazoSemRespostaMinutos(row.settings);
    if (minutos !== null) prazos.set(row.id, minutos);
  }
  return prazos;
}

export async function devolverSemResposta(
  admin: SupabaseClient,
  requestId: string,
  agora: Date = new Date(),
): Promise<SemRespostaResultado> {
  const prazoPorOrg = await prazosPorOrganizacao(admin);
  if (prazoPorOrg.size === 0) return { organizacoes: 0, examinadas: 0, devolvidas: 0, falhas: 0 };
  const orgIds = [...prazoPorOrg.keys()];

  const { data, error } = await admin
    .from("conversations")
    .select(
      "id, organization_id, status, is_group, assigned_to_user_id, assigned_at, last_inbound_at, last_outbound_at",
    )
    .in("organization_id", orgIds)
    .in("status", ["open", "pending", "claimed"])
    .eq("is_group", false)
    .not("assigned_to_user_id", "is", null)
    .not("last_inbound_at", "is", null)
    // Mais antigas primeiro: o que sobrar do teto é o mais recente.
    .order("last_inbound_at", { ascending: true })
    .limit(SCAN_LIMIT);
  if (error) throw new Error(`conversations: ${error.message}`);
  const conversas = (data ?? []) as ConversaComDono[];

  const vencidas = selecionarSemResposta(conversas, prazoPorOrg, agora.getTime());

  let devolvidas = 0;
  let falhas = 0;
  for (const { conversa } of vencidas) {
    const { data: linhas, error: erroAssign } = await admin.rpc("fn_conversation_assign", {
      p_organization_id: conversa.organization_id,
      p_conversation_id: conversa.id,
      p_to_user_id: null,
      p_reason: "release",
      p_expected_assignee: conversa.assigned_to_user_id,
      p_enforce_expected: true,
    });
    if (erroAssign) {
      falhas++;
      logger.error("[conversa-sem-resposta] devolução falhou", {
        conversation_id: conversa.id,
        organization_id: conversa.organization_id,
        error: erroAssign.message,
        requestId,
      });
      continue;
    }
    // Lista vazia = a trava "mesmo dono" não casou (a pessoa respondeu ou o dono
    // mudou): é o desfecho certo, não falha.
    if (!Array.isArray(linhas) || linhas.length === 0) continue;
    devolvidas++;
    const { error: erroRota } = await admin.rpc("fn_request_channel_routing", {
      p_org: conversa.organization_id,
      p_conversation: conversa.id,
    });
    if (erroRota) {
      logger.warn("[conversa-sem-resposta] pedido de roteamento falhou", {
        conversation_id: conversa.id,
        error: erroRota.message,
        requestId,
      });
    }
  }

  return { organizacoes: prazoPorOrg.size, examinadas: conversas.length, devolvidas, falhas };
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let resultado: SemRespostaResultado;
  try {
    resultado = await devolverSemResposta(createAdminClient(), requestId);
  } catch (err) {
    logger.error("[conversa-sem-resposta] varredura falhou", {
      error: err instanceof Error ? err.message : String(err),
      requestId,
    });
    return fail("internal_error", "Failed to scan conversations.", 500, { requestId });
  }

  if (resultado.devolvidas > 0 || resultado.falhas > 0) {
    void audit({
      action: "conversation.unanswered_return_run",
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
