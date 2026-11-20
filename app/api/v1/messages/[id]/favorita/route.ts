/**
 * POST/DELETE /api/v1/messages/[id]/favorita — marcar (ou tirar) a estrela de
 * uma mensagem na conversa, como na Umbler Talk (migration 0513). A marca é da
 * conversa: a equipe toda vê. Só quem enxerga a mensagem (RLS da sessão) marca.
 */
import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function marcar(ctx: Ctx, favorita: boolean): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ favoritada_em: favorita ? new Date().toISOString() : null, favoritada_por: favorita ? authz.user.id : null })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id, conversation_id, favoritada_em")
    .maybeSingle();
  if (error) return fail("internal_error", t("Não foi possível atualizar a mensagem."), 500, { requestId });
  if (!data) return fail("not_found", t("Mensagem não encontrada."), 404, { requestId });

  void audit({
    action: "message.favorite_changed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message",
    resourceId: id,
    requestId,
    metadata: { favorita, conversation_id: (data as { conversation_id: string }).conversation_id },
  });
  return ok(data, { requestId });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  return marcar(ctx, true);
}
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  return marcar(ctx, false);
}
