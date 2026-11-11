/**
 * POST /api/v1/chatbot-flows/:id/versoes/:vid/restaurar — volta o desenho para
 * uma versão publicada (pendência V1 da auditoria funcional).
 *
 * Num fluxo LIGADO, a versão vai para o RASCUNHO: nada muda para os clientes
 * até alguém conferir e publicar. Num fluxo desligado, vai direto para o
 * desenho. Os passos são conferidos contra o plano de HOJE (uma versão do
 * Impulso não entra num fluxo do Essencial por esta porta), e os segredos do
 * WebHook continuam lacrados a este fluxo — a versão é deste mesmo fluxo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { grafoSchema } from "@/lib/chatbot/passos";
import { conferirPassosDoPlano } from "@/lib/chatbot/plano";

type Ctx = { params: Promise<{ id: string; vid: string }> };
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Corpo = z.object({ revisao: z.number().int().min(0).optional() }).strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;
  const { id, vid } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(vid))
    return fail("invalid_request", "id inválido.", 400, { requestId });
  const corpo = Corpo.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!corpo.success)
    return fail("validation_failed", "Campos inválidos.", 422, { requestId, details: corpo.error.flatten() });

  const db = await createClient();
  const { data: fluxo } = await db
    .from("chatbot_flows")
    .select("id, is_active, revisao")
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (!fluxo) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });
  if (corpo.data.revisao !== undefined && corpo.data.revisao !== (fluxo.revisao ?? 0))
    return fail(
      "conflict",
      "Este fluxo foi salvo em outra aba ou por outra pessoa. Recarregue antes de restaurar.",
      409,
      { requestId },
    );

  const { data: versao } = await db
    .from("chatbot_flow_versions")
    .select("id, numero, grafo")
    .eq("id", vid)
    .eq("flow_id", id)
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (!versao) return fail("not_found", "Versão não encontrada.", 404, { requestId });
  const grafo = grafoSchema.safeParse(versao.grafo);
  if (!grafo.success)
    return fail("validation_failed", "Esta versão não pode mais ser aberta.", 422, { requestId });

  const passos = await conferirPassosDoPlano(auth.org.orgId, grafo.data);
  if (!passos.ok) return fail(passos.code, passos.message, passos.status, { requestId });

  const revisao = (fluxo.revisao ?? 0) + 1;
  const update = fluxo.is_active
    ? { rascunho: grafo.data, revisao, updated_at: new Date().toISOString() }
    : { grafo: grafo.data, rascunho: null, revisao, updated_at: new Date().toISOString() };
  const { data, error } = await db
    .from("chatbot_flows")
    .update(update)
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .eq("revisao", fluxo.revisao ?? 0)
    .select("id, is_active, grafo, rascunho, revisao, updated_at")
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível restaurar.", 500, { requestId });
  if (!data)
    return fail(
      "conflict",
      "Este fluxo foi salvo em outra aba ou por outra pessoa. Recarregue antes de restaurar.",
      409,
      { requestId },
    );

  await audit({
    action: "chatbot_flow.version_restored",
    organizationId: auth.org.orgId,
    actorUserId: auth.user.id,
    resourceType: "chatbot_flow",
    resourceId: id,
    requestId,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent"),
    metadata: { versao: versao.numero, para: fluxo.is_active ? "rascunho" : "desenho" },
  });
  return ok(data, { requestId });
}
