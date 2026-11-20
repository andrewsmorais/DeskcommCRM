/**
 * O lado das ROTAS das mensagens agendadas (migration 0511): conferir o pedido
 * contra a conversa que o usuário enxerga e gravar com a service role, junto
 * com o evento que o worker drena no horário.
 *
 * Quem decide se o usuário ENXERGA a conversa é a RLS: a leitura usa o client
 * do usuário. A escrita usa a service role (a tabela é server-only) e por isso
 * filtra `organization_id` resolvido da sessão, nunca do corpo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { inicioManual } from "@/lib/chatbot/motor";
import { grafoSchema } from "@/lib/chatbot/passos";

import { EVENTO_DA_AGENDADA, type AgendadaInput } from "./regras";

export type ConversaDaAgendada = {
  id: string;
  contact_id: string;
  is_group: boolean;
  channel_session_id: string | null;
  contacts: { is_blocked: boolean | null; is_anonymized: boolean | null } | null;
};

/** A conversa como o usuário a enxerga (RLS), ou null. */
export async function conversaVisivel(
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
): Promise<ConversaDaAgendada | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id, contact_id, is_group, channel_session_id, contacts:contact_id(is_blocked, is_anonymized)")
    .eq("id", conversationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as unknown as ConversaDaAgendada | null) ?? null;
}

/** Por que este pedido não pode ser agendado nesta conversa, ou null. */
export async function problemaDoPedido(
  supabase: SupabaseClient,
  orgId: string,
  conversa: ConversaDaAgendada,
  input: AgendadaInput,
): Promise<string | null> {
  if (conversa.contacts?.is_blocked) return "Este contato está bloqueado e não recebe mensagens.";
  if (conversa.contacts?.is_anonymized) return "Este contato foi anonimizado.";
  if (input.tipo === "nota") return null;
  if (!conversa.channel_session_id) return "Esta conversa não tem número de WhatsApp.";
  if (input.tipo === "chatbot") {
    if (conversa.is_group) return "O chatbot não atende grupos.";
    const { data: fluxo } = await supabase
      .from("chatbot_flows")
      .select("id, is_active, grafo")
      .eq("id", input.chatbot_flow_id ?? "")
      .eq("organization_id", orgId)
      .maybeSingle();
    const g = grafoSchema.safeParse(fluxo?.grafo);
    if (!fluxo || !fluxo.is_active || !g.success || !inicioManual(g.data))
      return 'O chatbot precisa estar ligado e ter o passo "Iniciar manualmente".';
  }
  return null;
}

/** O evento que acorda o worker no horário. */
export async function agendarEnvio(
  admin: SupabaseClient,
  orgId: string,
  agendadaId: string,
  enviarEm: string,
): Promise<{ error: { message: string } | null }> {
  return admin.from("event_log").insert({
    organization_id: orgId,
    event_type: EVENTO_DA_AGENDADA,
    entity_kind: "mensagem_agendada",
    entity_id: agendadaId,
    payload: { agendada_id: agendadaId },
    metadata: { source: "inbox" },
    next_attempt_at: new Date(enviarEm).toISOString(),
  });
}
