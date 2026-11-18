import { originFromAutomationEvent } from "@/lib/atendimento/origem-automacao";
/**
 * Ação `create_or_move_lead` — reusa os handlers core de /api/v1/leads
 * (mesmo caminho que REST/MCP) em vez de duplicar a lógica de criação/move.
 *
 * Actor = `webhook_source` com id = ruleId (ator automático; audit registra
 * actor_type=webhook_source). requestId = `rule:${ruleId}` — os handlers
 * propagam esse valor pro metadata.request_id dos eventos que emitem, e é
 * esse prefixo "rule:" que o engine (Task 8) usa pra não reprocessar os
 * eventos derivados (anti-loop profundidade 1: regra→ação→handler→evento).
 */
import { registerAction } from "@/lib/automation/actions";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { levarContatoAoFunil } from "@/lib/leads/levar-ao-funil";
import { createLeadHandler } from "@/app/api/v1/leads/_handler";
import {
  type EtapaDoFunil,
  type OrigemParaClonar,
  escolheEtapaDeDestino,
  montaPayloadDoClone,
} from "@/lib/leads/clonar-para-funil";

async function execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const pipelineId = typeof config.pipeline_id === "string" ? config.pipeline_id : null;
  const stageId = typeof config.stage_id === "string" ? config.stage_id : null;
  if (!pipelineId || !stageId) {
    return { type: "create_or_move_lead", status: "failed", error: "missing_config" };
  }

  const handlerCtx: HandlerCtx = {
    organization_id: ctx.organizationId,
    actor: { type: "webhook_source", id: ctx.ruleId },
    requestId: `rule:${ctx.ruleId}`,
  };
  const lead = ctx.context.lead as
    | (Partial<OrigemParaClonar> & { id: string; pipeline_id: string; contact_id?: string | null })
    | undefined;
  const contact = ctx.context.contact as
    | { id: string; name?: string | null; display_name?: string | null; phone_number?: string | null }
    | undefined;

  const contactId = contact?.id ?? lead?.contact_id ?? undefined;
  handlerCtx.serviceOrigin = contactId
    ? (await originFromAutomationEvent(ctx, contactId)) ?? { kind: "unavailable", reason: "origin_capture_failed" }
    : { kind: "unavailable", reason: "origin_capture_failed" };

  try {
    if (lead) {
      if (lead.pipeline_id !== pipelineId) {
        // ── lead.won COM OUTRO FUNIL: A CONTINUAÇÃO (pós-venda) ──────────────
        // O negócio que ganhou NÃO é tocado (segue `won`, na etapa de ganho).
        // Nasce um card NOVO no funil de destino com o conteúdo dele (o mesmo
        // `montaPayloadDoClone` do /clone). Uma continuação por NEGÓCIO: se já
        // existe card com `clonado_de.lead_id` = este negócio, nada se escreve.
        if (ctx.event?.event_type === "lead.won") {
          if (typeof ctx.event.entity_id === "string" && ctx.event.entity_id !== lead.id) {
            return { type: "create_or_move_lead", status: "failed", error: "lead_already_transferred_in_event" };
          }
          const { data: etapas, error: etapasErr } = await ctx.admin
            .from("crm_stages")
            .select("id, pipeline_id, position, is_won, is_lost, is_archived")
            .eq("organization_id", ctx.organizationId)
            .eq("pipeline_id", pipelineId)
            .eq("is_archived", false)
            .order("position", { ascending: true });
          if (etapasErr) {
            return { type: "create_or_move_lead", status: "failed", error: etapasErr.message };
          }
          const destino = escolheEtapaDeDestino((etapas ?? []) as EtapaDoFunil[], stageId);
          if (!destino.ok) {
            // `texto` é frase de gente (a aba Atividade a imprime), não código.
            return { type: "create_or_move_lead", status: "failed", error: destino.texto };
          }
          const { data: continuacao, error: continuacaoErr } = await ctx.admin
            .from("crm_leads")
            .select("*")
            .eq("organization_id", ctx.organizationId)
            .eq("pipeline_id", pipelineId)
            .eq("source_metadata->clonado_de->>lead_id", lead.id)
            .limit(1)
            .maybeSingle();
          // Falha de leitura é recusa, nunca "não achei": criaria a duplicata.
          if (continuacaoErr) {
            return { type: "create_or_move_lead", status: "failed", error: continuacaoErr.message };
          }
          if (continuacao) {
            publicaNoContexto(ctx, continuacao as Record<string, unknown>, contactId);
            return {
              type: "create_or_move_lead",
              status: "success",
              detail: { ja_existia: String((continuacao as { id?: unknown }).id ?? ""), origem: lead.id },
            };
          }
          const payload = montaPayloadDoClone(lead as OrigemParaClonar, destino.etapa);
          // Continuação de um negócio que já ganhou não é nova tentativa.
          const criado = await createLeadHandler(ctx.admin, handlerCtx, {
            ...payload,
            retomado_de_lead_id: null,
          } as Parameters<typeof createLeadHandler>[2]);
          publicaNoContexto(ctx, criado as Record<string, unknown>, contactId);
          return {
            type: "create_or_move_lead",
            status: "success",
            detail: { criado: String((criado as { id?: unknown }).id ?? ""), origem: lead.id },
          };
        }
        return { type: "create_or_move_lead", status: "failed", error: "cross_pipeline_move_not_allowed" };
      }
      // lead.won no MESMO funil: mover reabriria o negócio ganho e viraria laço
      // (#1528). Só vale criar a continuação em OUTRO funil.
      if (ctx.event?.event_type === "lead.won") {
        return { type: "create_or_move_lead", status: "failed", error: "continuacao_exige_outro_funil" };
      }
      const movido = await moveLeadHandler(ctx.admin, handlerCtx, lead.id, { to_stage_id: stageId });
      publicaNoContexto(ctx, movido, contactId);
      return { type: "create_or_move_lead", status: "success", detail: { moved: lead.id } };
    }
    if (contact) {
      const r = await levarContatoAoFunil(ctx.admin, handlerCtx, contact, pipelineId, stageId, {
        // O título nasce do MESMO resolvedor das telas. Remontado à mão, ele
        // gravava `Contato 543134@lid` no card do funil — e título de lead
        // não se reescreve sozinho depois.
        tituloNovo: nomeDoContato(contact) ?? contact.phone_number ?? "Lead da automação",
        source: "automation",
        quem: "pela automação",
      });
      if (!r.ok) return { type: "create_or_move_lead", status: "failed", error: r.error };
      // O CLONE (quando transferiu) é o negócio das próximas ações da regra — não o que fechou.
      publicaNoContexto(ctx, r.lead, contact.id);
      const detail =
        r.acao === "moved"
          ? { moved: String(r.lead.id ?? "") }
          : r.acao === "transferido"
            ? { transferido: String(r.lead.id ?? ""), origem: r.origem }
            : { created: String(r.lead.id ?? "") };
      return { type: "create_or_move_lead", status: "success", detail };
    }
    return { type: "create_or_move_lead", status: "skipped", detail: { reason: "no_lead_or_contact" } };
  } catch (err) {
    return {
      type: "create_or_move_lead",
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * As ações seguintes da MESMA regra passam a enxergar o lead.
 *
 * `assign_owner` lê `ctx.context.lead` e, num gatilho de contato, devolvia
 * `skipped: missing_input` mesmo depois de esta ação ter criado o negócio —
 * a execução inteira aparecia como "Parcial" na aba Atividade (#958). As
 * condições da regra já foram avaliadas quando isto roda (`engine.ts` filtra
 * `applicable` antes do laço), então escrever aqui não muda o que casou.
 */
function publicaNoContexto(ctx: ActionCtx, row: Record<string, unknown>, contactId?: string): void {
  // A LINHA INTEIRA, mesclada com o que já havia no contexto — nunca um objeto
  // com três campos. `add_tag` lê `ctx.context.lead.tags` como "as tags do
  // banco" e grava `[...prev, ...added]`: com um objeto parcial, `prev` é `[]`
  // e o UPDATE APAGA as tags existentes do negócio, inclusive a de anúncio que
  // `lib/leads/nascimento-do-lead.ts` grava. `call_webhook` projeta o mesmo
  // objeto sobre LEAD_PUBLIC_FIELDS, então o corpo entregue ao endpoint do
  // cliente encolheria em silêncio pelo mesmo motivo.
  const anterior = (ctx.context.lead ?? {}) as Record<string, unknown>;
  ctx.context.lead = {
    ...anterior,
    ...row,
    contact_id: row.contact_id ?? contactId ?? anterior.contact_id ?? null,
  };
}

registerAction({ type: "create_or_move_lead", execute });
