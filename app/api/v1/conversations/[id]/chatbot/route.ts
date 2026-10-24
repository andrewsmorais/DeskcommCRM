import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/chatbot — o atendente aciona um chatbot nesta
 * conversa ("Iniciar manualmente", como na Umbler): pesquisa de satisfação no
 * fim do atendimento, menu de pagamento, coleta de dados.
 *
 * Não roda o chatbot aqui: o executor vive no worker, junto com o pool do banco
 * (o mesmo desenho da ação de automação "Iniciar chatbot"). A rota confere o
 * fluxo e a conversa, fixa a fronteira do atendimento e emite
 * `chatbot.inicio_requested` com `manual: true`, que o drain do worker consome
 * (`iniciarChatbotPorAutomacao`).
 *
 * A conversa pode ser do atendente que clicou — e o chatbot responde nela até o
 * fluxo terminar (a sessão leva a marca `_manual`). Sem a marca, conversa com
 * dono humano nunca é respondida pelo chatbot.
 *
 * Auth: cookie session, agent+ (escrita é agent+, viewer é read-only).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { requireRole } from "@/lib/auth/require-role";
import { inicioManual } from "@/lib/chatbot/motor";
import { grafoSchema } from "@/lib/chatbot/passos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({ flow_id: z.string().uuid() });

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return fail("validation_failed", t("Escolha um chatbot."), 422, { requestId });

  // Client do REQUEST: a policy de conversas aplica o `visibility_mode` — quem
  // não enxerga a conversa não aciona chatbot nela.
  const supabase = await createClient();
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id, channel_session_id, status, is_group, contacts:contact_id(is_blocked)")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  if (!conv) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const c = conv as unknown as {
    id: string;
    contact_id: string;
    channel_session_id: string | null;
    status: string;
    is_group: boolean;
    contacts: { is_blocked: boolean | null } | null;
  };
  if (c.is_group)
    return fail("validation_failed", t("O chatbot não atende grupos."), 422, { requestId });
  if (c.contacts?.is_blocked)
    return fail("validation_failed", t("Este contato está bloqueado e não recebe mensagens."), 422, {
      requestId,
    });
  if (!c.channel_session_id)
    return fail("validation_failed", t("Esta conversa não tem número de WhatsApp."), 422, { requestId });

  const { data: fluxo } = await supabase
    .from("chatbot_flows")
    .select("id, name, is_active, grafo")
    .eq("id", corpo.data.flow_id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const g = grafoSchema.safeParse(fluxo?.grafo);
  if (!fluxo || !fluxo.is_active || !g.success || !inicioManual(g.data)) {
    return fail(
      "validation_failed",
      t('O chatbot precisa estar ligado e ter o passo "Iniciar manualmente".'),
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  let boundary;
  try {
    // O clique é a ORIGEM autorizadora deste atendimento (como mandar mensagem
    // pela tela): conversa fechada volta a ter atendimento.
    boundary = await beginServiceAtOrigin(admin, org.orgId, c.contact_id, c.channel_session_id);
  } catch {
    return fail("conflict", t("A conversa mudou enquanto você clicava. Tente de novo."), 409, { requestId });
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
      iniciado_por: user.id,
    },
    p_metadata: { source: "inbox", request_id: requestId, user_id: user.id },
    p_organization_id: org.orgId,
  });
  if (erroDoEvento) return fail("internal_error", t("Não foi possível iniciar o chatbot."), 500, { requestId });

  await audit({
    action: "chatbot_flow.started_manually",
    organizationId: org.orgId,
    actorUserId: user.id,
    resourceType: "conversation",
    resourceId: c.id,
    requestId,
    metadata: { flow_id: fluxo.id },
  });

  return ok({ iniciado: true, flow_id: fluxo.id }, { requestId });
}
