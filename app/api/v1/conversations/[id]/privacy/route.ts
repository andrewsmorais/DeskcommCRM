import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/privacy — torna a conversa privada ou a libera.
 *
 * Privada (`conversations.is_private`, migration 0495): só o atendente
 * responsável, gerente/admin e o super-admin a veem — quem decide é a RLS
 * (`fn_can_view_conversation` de 3 argumentos), não esta rota.
 *
 * Quem pode: gerente/admin em qualquer conversa; atendente só na conversa que
 * é DELE. Privar uma conversa sem responsável a esconderia de todos os
 * atendentes até alguém a atribuir, então a rota recusa (409) — atribua antes.
 * O passo "Privar ou liberar" do chatbot não passa por aqui (o executor grava
 * com o service role).
 *
 * Auth: cookie, role >= agent. Audit: `conversation.privacy_changed` com prev/next.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { validateRequest } from "@/lib/schemas/_validate";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ is_private: z.boolean() });

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let input;
  try {
    input = await validateRequest(bodySchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();
  // Lida com o client do usuário: conversa que ele não vê responde 404.
  const { data: atual } = await supabase
    .from("conversations")
    .select("id, is_private, assigned_to_user_id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const conversa = atual as {
    id: string;
    is_private: boolean;
    assigned_to_user_id: string | null;
  } | null;
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const gestor = roleAtLeast(org.role, "manager");
  if (!gestor && conversa.assigned_to_user_id !== user.id) {
    return fail(
      "forbidden",
      t("Só o atendente responsável ou um gerente pode mudar a privacidade desta conversa."),
      403,
      { requestId },
    );
  }
  if (input.is_private && !conversa.assigned_to_user_id) {
    return fail(
      "conflict",
      t("Atribua a conversa a um atendente antes de torná-la privada."),
      409,
      { requestId },
    );
  }
  if (conversa.is_private === input.is_private) return ok(conversa, { requestId });

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const { data, error } = await supabase
    .from("conversations")
    .update({ is_private: input.is_private })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id, is_private, assigned_to_user_id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  await audit({
    action: "conversation.privacy_changed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: id,
    metadata: { conversation_id: id, is_private: input.is_private, prev: conversa.is_private },
    requestId,
  });

  return ok(data, { requestId });
}
