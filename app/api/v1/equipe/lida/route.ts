import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/equipe/lida { com } — marca a conversa do chat interno como
 * lida até agora, para quem pergunta. Como o `mark-read` das conversas com
 * clientes, não audita: é a tela registrando o que a pessoa viu, não uma
 * mudança no trabalho da empresa.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { chaveDaConversaSchema } from "@/lib/equipe/chat";
import { validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(z.object({ com: chaveDaConversaSchema }), req);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }

  const lida_ate = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("equipe_leituras")
    .upsert(
      { organization_id: authz.org.orgId, user_id: authz.user.id, conversa: input.com, lida_ate },
      { onConflict: "organization_id,user_id,conversa" },
    );
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok({ com: input.com, lida_ate }, { requestId });
}
