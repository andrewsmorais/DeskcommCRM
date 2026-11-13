/**
 * PEDIR UM CHATBOT NA CONVERSA, EM NOME DE UM ATENDENTE ("Iniciar manualmente").
 *
 * Uma régua só para as duas portas da tela: o botão do robô
 * (`POST /api/v1/conversations/[id]/chatbot`) e o chatbot de encerramento do
 * Fechar (`POST /api/v1/conversations/[id]/close`). Enquanto cada uma tinha a
 * sua cópia, mudar uma condição (grupo, bloqueio, fluxo ligado) numa deixaria a
 * outra aceitando o que a primeira recusa.
 *
 * Não roda o chatbot aqui: emite `chatbot.inicio_requested` com `manual: true`,
 * que o drain do worker consome (`iniciarChatbotPorAutomacao`). A conversa é
 * lida com o client do USUÁRIO (a RLS decide se ele a enxerga); a fronteira do
 * atendimento e o evento usam a service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { inicioManual } from "@/lib/chatbot/motor";
import { grafoSchema, type Grafo } from "@/lib/chatbot/passos";

export type ResultadoDoPedido =
  | { ok: true; conversationId: string; contactId: string; flowId: string }
  | {
      ok: false;
      status: 404 | 409 | 422 | 500;
      code: "not_found" | "conflict" | "validation_failed" | "internal_error";
      mensagem: string;
    };

/** O fluxo tem o passo que encerra a conversa? (exigido no chatbot de encerramento) */
export function temPassoFinalizar(g: Grafo): boolean {
  return g.nodes.some((n) => n.type === "finalizar_conversa");
}

export async function pedirChatbotManual(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  args: {
    orgId: string;
    conversationId: string;
    flowId: string;
    userId: string;
    requestId: string;
    /** Chatbot de encerramento: precisa terminar no passo "Finalizar conversa". */
    exigirFinalizar?: boolean;
  },
): Promise<ResultadoDoPedido> {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id, channel_session_id, status, is_group, contacts:contact_id(is_blocked)")
    .eq("id", args.conversationId)
    .eq("organization_id", args.orgId)
    .maybeSingle();
  if (convErr) return { ok: false, status: 500, code: "internal_error", mensagem: convErr.message };
  if (!conv)
    return { ok: false, status: 404, code: "not_found", mensagem: "Conversa não encontrada." };
  const c = conv as unknown as {
    id: string;
    contact_id: string;
    channel_session_id: string | null;
    is_group: boolean;
    contacts: { is_blocked: boolean | null } | null;
  };
  if (c.is_group)
    return {
      ok: false,
      status: 422,
      code: "validation_failed",
      mensagem: "O chatbot não atende grupos.",
    };
  if (c.contacts?.is_blocked)
    return {
      ok: false,
      status: 422,
      code: "validation_failed",
      mensagem: "Este contato está bloqueado e não recebe mensagens.",
    };
  if (!c.channel_session_id)
    return {
      ok: false,
      status: 422,
      code: "validation_failed",
      mensagem: "Esta conversa não tem número de WhatsApp.",
    };

  const { data: fluxo } = await supabase
    .from("chatbot_flows")
    .select("id, name, is_active, grafo")
    .eq("id", args.flowId)
    .eq("organization_id", args.orgId)
    .maybeSingle();
  const g = grafoSchema.safeParse(fluxo?.grafo);
  if (!fluxo || !fluxo.is_active || !g.success || !inicioManual(g.data))
    return {
      ok: false,
      status: 422,
      code: "validation_failed",
      mensagem: 'O chatbot precisa estar ligado e ter o passo "Iniciar manualmente".',
    };
  if (args.exigirFinalizar && !temPassoFinalizar(g.data))
    return {
      ok: false,
      status: 422,
      code: "validation_failed",
      mensagem:
        'O chatbot de encerramento precisa ter o passo "Finalizar conversa", que é quem encerra o atendimento.',
    };

  let boundary;
  try {
    boundary = await beginServiceAtOrigin(admin, args.orgId, c.contact_id, c.channel_session_id);
  } catch {
    return {
      ok: false,
      status: 409,
      code: "conflict",
      mensagem: "A conversa mudou enquanto você clicava. Tente de novo.",
    };
  }

  const { error: erroDoEvento } = await admin.rpc("emit_event", {
    p_event_type: "chatbot.inicio_requested",
    p_entity_kind: "contact",
    p_entity_id: c.contact_id,
    p_payload: {
      flow_id: fluxo.id,
      contact_id: c.contact_id,
      conversation_id: boundary.conversation_id,
      channel_session_id: c.channel_session_id,
      boundary,
      variaveis: {},
      regra_id: null,
      manual: true,
      iniciado_por: args.userId,
    },
    p_metadata: { source: "inbox", request_id: args.requestId, user_id: args.userId },
    p_organization_id: args.orgId,
  });
  if (erroDoEvento)
    return {
      ok: false,
      status: 500,
      code: "internal_error",
      mensagem: "Não foi possível iniciar o chatbot.",
    };

  return { ok: true, conversationId: c.id, contactId: c.contact_id, flowId: fluxo.id };
}
