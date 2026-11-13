import { z } from "zod";
import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/close — fecha a conversa.
 *
 * Não bloqueia por assignee — qualquer membro com permissão (RLS) pode fechar.
 *
 * ENCERRAMENTO (como o "Finalizar" da Umbler Talk), opcional no corpo:
 *   - `nenhum` (padrão) — só encerra, como sempre foi;
 *   - `mensagem` — manda a despedida ANTES de encerrar, em nome de quem fechou,
 *     pelo mesmo `sendMessageHandler` da tela. Se ela não sair, a conversa NÃO
 *     é encerrada: encerrar sem a despedida que a pessoa pediu seria fechar a
 *     porta na cara do cliente sem ela saber;
 *   - `chatbot` — aciona um chatbot de encerramento (pesquisa de satisfação,
 *     por exemplo) e NÃO encerra aqui: quem encerra é o passo "Finalizar
 *     conversa" do próprio fluxo, depois de o cliente responder. Fechar antes
 *     cortaria o fluxo no meio. Por isso o fluxo precisa ter esse passo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { pedirChatbotManual } from "@/lib/chatbot/iniciar-manual";
import type { SendMessageInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/messaging";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  let body: unknown = {};
  const text = await req.text();
  try { body = text ? JSON.parse(text) : {}; } catch { return fail("validation_failed", "Corpo inválido.", 422, { requestId }); }
  const parsed = z
    .object({
      expected_revision: z.number().int().positive().optional(),
      encerramento: z
        .discriminatedUnion("tipo", [
          z.object({ tipo: z.literal("nenhum") }),
          z.object({ tipo: z.literal("mensagem"), texto: z.string().trim().min(1).max(4096) }),
          z.object({ tipo: z.literal("chatbot"), chatbot_flow_id: z.string().uuid() }),
        ])
        .optional(),
    })
    .safeParse(body);
  if (!parsed.success) return fail("validation_failed", "Pedido de encerramento inválido.", 422, { requestId });
  const { id } = await ctx.params;
  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const user = authz.user;

  const { data: visible, error: readError } = await supabase.from("conversations")
    .select("id, organization_id, service_revision").eq("id", id)
    .eq("organization_id", authz.org.orgId).maybeSingle();
  if (readError) return fail("internal_error", readError.message, 500, { requestId });
  if (!visible) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const encerramento = parsed.data.encerramento ?? { tipo: "nenhum" as const };
  let revisaoDoFechamento = parsed.data.expected_revision ?? visible.service_revision;

  if (encerramento.tipo === "chatbot") {
    const r = await pedirChatbotManual(supabase, createAdminClient(), {
      orgId: authz.org.orgId,
      conversationId: id,
      flowId: encerramento.chatbot_flow_id,
      userId: user.id,
      requestId,
      exigirFinalizar: true,
    });
    if (!r.ok) return fail(r.code, t(r.mensagem), r.status, { requestId });
    await audit({
      action: "chatbot_flow.started_manually",
      organizationId: authz.org.orgId,
      actorUserId: user.id,
      resourceType: "conversation",
      resourceId: id,
      requestId,
      metadata: { flow_id: r.flowId, encerramento: true },
    });
    // Não encerra: o passo "Finalizar conversa" do fluxo encerra no fim.
    return ok({ id, encerramento: "chatbot", flow_id: r.flowId }, { requestId });
  }

  if (encerramento.tipo === "mensagem") {
    // A trava de revisão vale ANTES da despedida: se o atendimento mudou desde
    // que a tela abriu, nada sai — a despedida não pode ir para um atendimento
    // que a pessoa não estava vendo.
    if (
      parsed.data.expected_revision !== undefined &&
      parsed.data.expected_revision !== visible.service_revision
    )
      return fail("conflict", t("O atendimento mudou. Atualize e tente novamente."), 409, { requestId });
    const naoSaiu = t("A mensagem de despedida não saiu, e a conversa continua aberta.");
    let despedida;
    try {
      despedida = await sendMessageHandler(
        supabase,
        {
          organization_id: authz.org.orgId,
          actor: { type: "user", id: user.id, role: authz.org.role },
          requestId,
          idioma: authz.user.idioma,
        },
        { conversation_id: id, type: "text", body: encerramento.texto } as SendMessageInput,
      );
    } catch (err) {
      const motivo = err instanceof Error ? err.message : "";
      return fail("validation_failed", `${naoSaiu} ${motivo}`.trim(), 422, { requestId });
    }
    if (despedida.status === "failed") return fail("validation_failed", naoSaiu, 422, { requestId });
    // A despedida pode ter mexido no atendimento (resposta humana assume a
    // conversa livre, por exemplo). A pessoa já confirmou que quer encerrar e a
    // mensagem já saiu: fecha sobre a revisão de AGORA, para não sobrar uma
    // despedida enviada numa conversa que o 409 deixou aberta.
    const { data: atual } = await supabase
      .from("conversations")
      .select("service_revision")
      .eq("id", id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    if (atual) revisaoDoFechamento = (atual as { service_revision: number }).service_revision;
  }

  const { data, error } = await createAdminClient().rpc("fn_service_status", {
    p_org: visible.organization_id, p_conversation: id, p_status: "closed",
    p_expected: revisaoDoFechamento,
  });
  if (error) return fail(error.code === "40001" ? "conflict" : "internal_error",
    error.code === "40001" ? t("O atendimento mudou. Atualize e tente novamente.") : error.message,
    error.code === "40001" ? 409 : 500, { requestId });
  const conv = data as unknown as Conversation;

  await audit({
    action: "conversation.closed",
    actorUserId: user.id,
    organizationId: conv.organization_id,
    resourceType: "conversation",
    resourceId: conv.id,
    requestId,
  });

  return ok(conv, { requestId });
}
