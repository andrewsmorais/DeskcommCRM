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
import { requireRole } from "@/lib/auth/require-role";
import { pedirChatbotManual } from "@/lib/chatbot/iniciar-manual";
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
  const r = await pedirChatbotManual(await createClient(), createAdminClient(), {
    orgId: org.orgId,
    conversationId: id,
    flowId: corpo.data.flow_id,
    userId: user.id,
    requestId,
  });
  if (!r.ok) return fail(r.code, t(r.mensagem), r.status, { requestId });
  const c = { id: r.conversationId };
  const fluxo = { id: r.flowId };

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
