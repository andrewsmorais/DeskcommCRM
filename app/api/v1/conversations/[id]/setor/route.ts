/**
 * POST /api/v1/conversations/[id]/setor — põe a conversa num setor (ou tira, com null).
 *
 * Ir para um setor é passar para as pessoas dele: a IA fica calada, um dono que
 * não é do setor solta a conversa, e a Distribuição de atendimento escolhe
 * alguém do setor. A sequência mora em `transferirParaSetor`
 * (lib/setores/servico.ts), a mesma do passo do chatbot.
 *
 * Auth: cookie, agent+, e a conversa precisa estar visível para quem pede (lida
 * com o client do usuário: conversa privada de outro atendente responde 404).
 * Audit: `conversation.setor_changed`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { validateRequest } from "@/lib/schemas/_validate";
import { transferirParaSetor } from "@/lib/setores/servico";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ setor_id: z.string().uuid().nullable() });

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let input;
  try {
    input = await validateRequest(bodySchema, req);
  } catch (err) {
    if (err instanceof ApiError)
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    throw err;
  }

  const { data: visivel } = await (
    await createClient()
  )
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!visivel) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const r = await transferirParaSetor(createAdminClient(), {
    organizationId: orgId,
    conversationId: id,
    setorId: input.setor_id,
  });
  if (!r.ok)
    return fail(
      "not_found",
      r.erro === "setor_nao_encontrado"
        ? t("Setor não encontrado.")
        : t("Conversa não encontrada."),
      404,
      { requestId },
    );

  await audit({
    action: "conversation.setor_changed",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "conversation",
    resourceId: id,
    metadata: {
      conversation_id: id,
      setor_id: input.setor_id,
      prev: r.setorAnterior,
      soltou_dono: r.soltouDono,
    },
    requestId,
  });
  return ok({ id, setor_id: input.setor_id, soltou_dono: r.soltouDono }, { requestId });
}
