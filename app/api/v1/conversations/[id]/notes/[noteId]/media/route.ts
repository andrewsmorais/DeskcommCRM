/**
 * GET /api/v1/conversations/[id]/notes/[noteId]/media — abre o ANEXO da nota
 * interna (migration 0547; trazido do produto original, #1863).
 *
 * 302 para uma URL assinada de 60 s no bucket `internal-media`. O anexo de nota
 * não tem `messages.id`, e servi-lo pela rota de mensagem seria servi-lo pelo
 * caminho que leva ao cliente. A conversa é conferida ANTES da nota, para não
 * responder "nota não existe" sobre a conversa de outra empresa.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthDual } from "@/lib/api/auth-dual";
import { comIdDaRequisicao, fail } from "@/lib/api/wrappers";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";
import { isMediaPathOwnedBy } from "@/lib/messaging/media/upload-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_S = 60;

interface RouteCtx {
  params: Promise<{ id: string; noteId: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await resolveAuthDual(req, {
    requestId,
    resource: "conversation_notes",
    role: "agent",
    scope: "mcp:read",
  });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.idioma ?? IDIOMA_PADRAO);
  const orgId = authz.organizationId;
  const { id: conversationId, noteId } = await ctx.params;
  const supabase = authz.supabase;

  const { data: conversa, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", t("Erro ao buscar conversa."), 500, { requestId });
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const { data: nota, error } = await supabase
    .from("conversation_notes")
    .select("id, media_storage_path")
    .eq("id", noteId)
    .eq("conversation_id", conversationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return fail("internal_error", t("Erro ao buscar nota."), 500, { requestId });
  // Nota sem anexo não é erro de servidor: não há o que servir. E o caminho
  // gravado tem de ser desta conversa (cinto: a rota da nota já conferiu).
  if (!nota?.media_storage_path || !isMediaPathOwnedBy(nota.media_storage_path, orgId, conversationId)) {
    return fail("not_found", t("Nota sem anexo."), 404, { requestId });
  }

  const admin = createAdminClient();
  const { data: assinada, error: signErr } = await admin.storage
    .from("internal-media")
    .createSignedUrl(nota.media_storage_path, SIGNED_URL_TTL_S);
  if (signErr || !assinada?.signedUrl) {
    return fail("internal_error", t("Erro ao abrir o arquivo."), 500, { requestId });
  }

  return comIdDaRequisicao(NextResponse.redirect(assinada.signedUrl, 302), requestId);
}
