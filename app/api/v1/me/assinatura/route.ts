import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH /api/v1/me/assinatura — o lápis da chave "Assinar" no campo de mensagem.
 *
 * Grava a assinatura no PERFIL de quem está logado (`user_metadata.assinatura`,
 * o mesmo campo da tela Perfil). Vazio volta a assinar com o nome do perfil.
 * Só mexe no próprio perfil: o client é o da sessão.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ASSINATURA_MAX } from "@/lib/conversas/preferencias";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpo = z.object({ assinatura: z.string().trim().max(ASSINATURA_MAX) });

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(corpo, req);
  } catch (err) {
    if (err instanceof ApiError)
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { assinatura: input.assinatura || null } });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "signature.changed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "user",
    resourceId: authz.user.id,
    requestId,
    metadata: { vazia: !input.assinatura },
  });
  return ok({ assinatura: input.assinatura || null }, { requestId });
}
