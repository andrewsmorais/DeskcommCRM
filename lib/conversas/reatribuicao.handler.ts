/**
 * Consumidor de `message.received` que aplica a REATRIBUIÇÃO AUTOMÁTICA
 * (migration 0514), como na Umbler Talk:
 *
 *   o contato escreveu numa conversa que tem um atendente humano como dono, e a
 *   regra desse atendente é "sempre" ou "offline" com ele indisponível →
 *   o atendente sai da conversa (`fn_conversation_assign` com 'release') e,
 *   conforme Configurações › Conversas:
 *     - liberar  → a distribuição escolhe outra pessoa (`fn_request_channel_routing`);
 *     - chatbot  → começa o chatbot escolhido (precisa de "Iniciar manualmente"),
 *                  pelo mesmo pedido do botão do robô (`chatbot.inicio_requested`).
 *
 * A conversa ganha uma nota dizendo por quê, e a auditoria registra. Grupo não
 * entra (grupo não é roteado). Nada a fazer → "skipped", sem auditoria.
 */
import { randomUUID } from "node:crypto";

import { audit } from "@/lib/audit";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { inicioManual } from "@/lib/chatbot/motor";
import { grafoSchema } from "@/lib/chatbot/passos";
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

import { lerPreferenciasDeConversa } from "./preferencias";
import { deveReatribuir } from "./reatribuicao";

export const REATRIBUICAO_HANDLER_KEY = "conversa-reatribuicao.v1";

export const reatribuicaoHandler: EventHandler = {
  key: REATRIBUICAO_HANDLER_KEY,
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const pular = (detail: string): HandlerResult => ({ consumer_key: REATRIBUICAO_HANDLER_KEY, status: "skipped", detail });
    const conversationId = typeof row.payload.conversation_id === "string" ? row.payload.conversation_id : null;
    if (!conversationId) return pular("sem_conversa");
    try {
      const admin = createAdminClient();
      const org = row.organization_id;
      const { data: conversa } = await admin
        .from("conversations")
        .select("id, contact_id, channel_session_id, assigned_to_user_id, assignee_kind, is_group, status")
        .eq("organization_id", org)
        .eq("id", conversationId)
        .maybeSingle();
      const c = conversa as {
        contact_id: string;
        channel_session_id: string | null;
        assigned_to_user_id: string | null;
        assignee_kind: string | null;
        is_group: boolean;
        status: string;
      } | null;
      if (!c || c.is_group || !c.assigned_to_user_id || c.assignee_kind === "ai") return pular("sem_dono_humano");

      const { data: disp } = await admin
        .from("attendant_availability")
        .select("is_available, reatribuicao")
        .eq("organization_id", org)
        .eq("user_id", c.assigned_to_user_id)
        .maybeSingle();
      const d = disp as { is_available: boolean; reatribuicao: string } | null;
      if (!d || !deveReatribuir(d.reatribuicao, d.is_available)) return pular("regra_nao_se_aplica");

      const atendente = c.assigned_to_user_id;
      const { error: erroSoltar } = await admin.rpc("fn_conversation_assign", {
        p_organization_id: org,
        p_conversation_id: conversationId,
        p_to_user_id: null as unknown as string,
        p_reason: "release",
        p_enforce_expected: false,
      });
      if (erroSoltar) return { consumer_key: REATRIBUICAO_HANDLER_KEY, status: "error", detail: erroSoltar.message.slice(0, 200) };

      const { data: o } = await admin.from("organizations").select("settings").eq("id", org).maybeSingle();
      const prefs = lerPreferenciasDeConversa((o as { settings?: unknown } | null)?.settings);
      let destino = "fila";
      if (prefs.reatribuicao.acao === "chatbot" && prefs.reatribuicao.chatbot_id && c.channel_session_id) {
        const { data: fluxo } = await admin
          .from("chatbot_flows")
          .select("id, is_active, grafo")
          .eq("organization_id", org)
          .eq("id", prefs.reatribuicao.chatbot_id)
          .maybeSingle();
        const g = grafoSchema.safeParse((fluxo as { grafo?: unknown } | null)?.grafo);
        if ((fluxo as { is_active?: boolean } | null)?.is_active && g.success && inicioManual(g.data)) {
          const boundary = await beginServiceAtOrigin(admin, org, c.contact_id, c.channel_session_id);
          const { error } = await admin.rpc("emit_event", {
            p_event_type: "chatbot.inicio_requested",
            p_entity_kind: "contact",
            p_entity_id: c.contact_id,
            p_payload: {
              flow_id: prefs.reatribuicao.chatbot_id,
              contact_id: c.contact_id,
              conversation_id: boundary.conversation_id,
              channel_session_id: c.channel_session_id,
              boundary,
              variaveis: {},
              regra_id: null,
              manual: true,
              iniciado_por: null,
            },
            p_metadata: { source: "reatribuicao", previous_assignee: atendente },
            p_organization_id: org,
          });
          if (!error) destino = "chatbot";
        }
      }
      if (destino === "fila") await admin.rpc("fn_request_channel_routing", { p_org: org, p_conversation: conversationId });

      const motivo = d.reatribuicao === "sempre" ? "a regra dele é sair sempre" : "ele estava indisponível";
      await admin.from("conversation_notes").insert({
        organization_id: org,
        conversation_id: conversationId,
        body:
          destino === "chatbot"
            ? `Reatribuição automática: o atendente saiu da conversa (${motivo}) e o chatbot começou.`
            : `Reatribuição automática: o atendente saiu da conversa (${motivo}) e ela voltou para a fila.`,
        created_by_name: "Reatribuição",
      });
      void audit({
        action: "conversation.reassigned_automatically",
        actorUserId: null,
        organizationId: org,
        resourceType: "conversation",
        resourceId: conversationId,
        requestId: randomUUID(),
        bypassedRls: true,
        metadata: { atendente_anterior: atendente, regra: d.reatribuicao, destino },
      });
      return { consumer_key: REATRIBUICAO_HANDLER_KEY, status: "ok", detail: destino };
    } catch (err) {
      return {
        consumer_key: REATRIBUICAO_HANDLER_KEY,
        status: "error",
        detail: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      };
    }
  },
};
