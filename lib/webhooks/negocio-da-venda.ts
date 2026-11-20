/**
 * O negócio de um pedido da Kiwify/Cakto anda de etapa a cada aviso — um
 * negócio por pedido (decisão do dono do produto, 23/10/2026).
 *
 * A rota de captação chama isto quando o aviso é de um pedido que JÁ tem
 * negócio (mesma chave `plataforma:pedido`, ou o carrinho abandonado da mesma
 * pessoa e produto que virou compra). Pelos mesmos handlers da tela:
 *   - `updateLeadHandler` mescla os campos do aviso (evento, produto, link,
 *     valor) — é o que o chatbot recebe como variáveis;
 *   - `moveLeadHandler` leva o negócio à etapa com o nome do evento ("Pago",
 *     "Aguardando pagamento"...), e emite `lead.stage_changed` — o gatilho das
 *     automações que mandam o chatbot ("Iniciar chatbot").
 *
 * Mover que o funil recusa (negócio encerrado num funil que não reabre) não
 * derruba a captação: os campos já foram gravados, e o motivo vai para o log.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { moveLeadHandler, updateLeadHandler } from "@/app/api/v1/leads/_handler";
import { logger } from "@/lib/logger";
import { etapaDoEvento, type AvisoDeVenda } from "./plataformas-de-venda";

export type Etapa = { id: string; name: string };

export async function etapasDoFunil(
  admin: SupabaseClient,
  organizationId: string,
  pipelineId: string | null,
): Promise<Etapa[]> {
  if (!pipelineId) return [];
  const { data } = await admin
    .from("crm_stages")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId);
  return ((data ?? []) as Etapa[]).map((e) => ({ id: String(e.id), name: String(e.name) }));
}

export async function atualizarNegocioDaVenda(
  admin: SupabaseClient,
  ctx: { organizationId: string; webhookSourceId: string; requestId: string },
  leadId: string,
  venda: AvisoDeVenda,
  etapas: Etapa[],
): Promise<{ movido: boolean }> {
  const handlerCtx = {
    organization_id: ctx.organizationId,
    actor: { type: "webhook_source" as const, id: ctx.webhookSourceId },
    requestId: ctx.requestId,
  };
  await updateLeadHandler(admin, handlerCtx, leadId, {
    custom_fields: venda.custom_fields,
    ...(venda.valorEmCentavos !== null ? { value_cents: venda.valorEmCentavos } : {}),
  });

  const destino = etapaDoEvento(venda.evento, etapas);
  if (!destino) return { movido: false };
  const { data: lead } = await admin
    .from("crm_leads")
    .select("stage_id")
    .eq("organization_id", ctx.organizationId)
    .eq("id", leadId)
    .maybeSingle();
  if ((lead as { stage_id?: string } | null)?.stage_id === destino) return { movido: false };
  try {
    await moveLeadHandler(admin, handlerCtx, leadId, {
      to_stage_id: destino,
      reason: `Aviso da ${venda.plataforma}: ${venda.evento ?? "evento"}`,
    });
    return { movido: true };
  } catch (err) {
    logger.warn("[webhooks.venda] negócio não mudou de etapa", {
      organizationId: ctx.organizationId,
      leadId,
      evento: venda.evento,
      erro: err instanceof Error ? err.message.slice(0, 160) : String(err),
    });
    return { movido: false };
  }
}
