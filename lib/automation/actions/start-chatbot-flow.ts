/**
 * Ação `start_chatbot_flow` — começa um fluxo de chatbot de "Iniciar por
 * automação" para o contato da regra: compra aprovada na Kiwify, carrinho
 * abandonado na Cakto, negócio que mudou de etapa.
 *
 * A ação NÃO roda o chatbot: o executor (lib/chatbot/executar.ts) vive no
 * worker, junto com o pool do banco que ele usa. Aqui ela confere o contato,
 * resolve a conversa e a fronteira do atendimento no número escolhido (o mesmo
 * `serviceForAutomation` de "Enviar mensagem no WhatsApp") e emite
 * `chatbot.inicio_requested`, que o drain do worker consome
 * (`drenarComandosDoChatbot`). As guardas de envio (janela do número, limite
 * diário, agenda) adiam o evento inteiro antes, como no envio de mensagem.
 *
 * Os campos do negócio viram variáveis do fluxo ({{produto}}, {{link_checkout}},
 * {{valor}}, {{evento_da_venda}}...), além de {{negocio}} (o título).
 */
import { protecaoAgendaSupabase } from "@/lib/agenda/protecao-followup";
import { registerAction } from "@/lib/automation/actions";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import { serviceForAutomation } from "@/lib/atendimento/origem-automacao";
import { checkDailyLimit } from "@/lib/automation/throttle";
import { adiarAteAJanelaAbrir } from "@/lib/automation/janela-do-canal";
import { checarGuardasDeContato } from "@/lib/automation/guarda-do-contato";

const TYPE = "start_chatbot_flow";
const CHAVE = /^[a-z_][a-z0-9_]{0,39}$/;

/** Campos do negócio e do contato como variáveis do fluxo (só valores simples). */
export function variaveisDoContexto(context: Record<string, unknown>): Record<string, string> {
  const saida: Record<string, string> = {};
  const lead = (context.lead ?? {}) as { title?: unknown; custom_fields?: unknown };
  const campos = (lead.custom_fields ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(campos)) {
    const chave = k
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9_]/g, "_");
    if (!CHAVE.test(chave)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      saida[chave] = String(v).slice(0, 1000);
  }
  if (typeof lead.title === "string") saida.negocio = lead.title.slice(0, 200);
  return saida;
}

async function postponeUntil(ctx: ActionCtx, config: Record<string, unknown>): Promise<string | null> {
  const contato = checarGuardasDeContato(ctx);
  if (contato.ok) {
    const protecao = (await protecaoAgendaSupabase(ctx.admin, ctx.organizationId, [contato.contact.id])).get(
      contato.contact.id,
    )!;
    if (protecao.motivo === "leitura_indisponivel") throw new Error("agenda_read_failed");
    if (protecao.adiar) return protecao.reavaliar_em;
  }
  const sessionId = typeof config.channel_session_id === "string" ? config.channel_session_id : null;
  if (!sessionId) return null;
  const fora = await adiarAteAJanelaAbrir(ctx.admin, ctx.organizationId, sessionId);
  if (fora) return fora;
  const diario = await checkDailyLimit(ctx.admin, ctx.organizationId, sessionId);
  return diario.allowed ? null : (diario.retry_at ?? null);
}

export async function executeStartChatbotFlow(
  ctx: ActionCtx,
  config: Record<string, unknown>,
): Promise<ActionResultDetail> {
  const flowId = typeof config.chatbot_flow_id === "string" ? config.chatbot_flow_id : null;
  const sessionId = typeof config.channel_session_id === "string" ? config.channel_session_id : null;
  if (!flowId || !sessionId) return { type: TYPE, status: "failed", error: "missing_config" };

  const guarda = checarGuardasDeContato(ctx);
  if (!guarda.ok) return { type: TYPE, status: "skipped", detail: { reason: guarda.reason } };
  const contact = guarda.contact;

  // O fluxo é da organização da REGRA, nunca de quem mandou o evento.
  const { data: fluxo, error } = await ctx.admin
    .from("chatbot_flows")
    .select("id, is_active")
    .eq("organization_id", ctx.organizationId)
    .eq("id", flowId)
    .maybeSingle();
  if (error) return { type: TYPE, status: "failed", error: error.message };
  if (!fluxo) return { type: TYPE, status: "failed", error: "chatbot_flow_not_found" };
  if (!fluxo.is_active) return { type: TYPE, status: "skipped", detail: { reason: "chatbot_flow_off" } };

  try {
    const boundary = await serviceForAutomation(ctx, contact.id, sessionId);
    const { error: erroDoEvento } = await ctx.admin.rpc("emit_event", {
      p_event_type: "chatbot.inicio_requested",
      p_entity_kind: "contact",
      p_entity_id: contact.id,
      p_payload: {
        flow_id: flowId,
        contact_id: contact.id,
        conversation_id: boundary.conversation_id,
        channel_session_id: sessionId,
        boundary,
        variaveis: variaveisDoContexto(ctx.context),
        regra_id: ctx.ruleId,
      },
      p_metadata: { source: "automation", rule_id: ctx.ruleId, request_id: ctx.requestId },
      p_organization_id: ctx.organizationId,
    });
    if (erroDoEvento) return { type: TYPE, status: "failed", error: erroDoEvento.message };
    return {
      type: TYPE,
      status: "success",
      detail: { chatbot_flow_id: flowId, conversation_id: boundary.conversation_id },
    };
  } catch (err) {
    return { type: TYPE, status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

registerAction({ type: TYPE, postponeUntil, execute: executeStartChatbotFlow });
