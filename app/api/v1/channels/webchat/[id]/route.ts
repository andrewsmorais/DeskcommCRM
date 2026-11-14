/**
 * Chat no site — alterar e remover um chat (administrador).
 *
 * `PATCH  /api/v1/channels/webchat/[id]` → nome, aparência, domínios, ligado.
 * `DELETE /api/v1/channels/webchat/[id]` → arquiva: o balão some do site e as
 *          conversas ficam na Inbox (remoção lógica, sem perder histórico).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { CHANNEL_PROVIDER_WEBCHAT } from "@/lib/channels/capabilities";
import { configDoChatSchema, lerConfigDoChat } from "@/lib/channels/webchat/config";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

import { COLUNAS_DO_CHAT, entradaDoChatSchema, paraATela, type LinhaDoChat } from "../_comum";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const alteracaoSchema = entradaDoChatSchema.partial().extend({ ligado: z.boolean().optional() }).strict();

async function lerChat(orgId: string, id: string): Promise<LinhaDoChat | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient()
    .from("channel_sessions")
    .select(COLUNAS_DO_CHAT)
    .eq("organization_id", orgId)
    .eq("provider", CHANNEL_PROVIDER_WEBCHAT)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  return (data as unknown as LinhaDoChat | null) ?? null;
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "webchat" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const { id } = await ctx.params;
  const pedido = alteracaoSchema.safeParse(await req.json().catch(() => null));
  if (!pedido.success)
    return fail("validation_failed", t("Confira os campos do chat."), 422, { requestId });
  const atual = await lerChat(authz.org.orgId, id);
  if (!atual) return fail("not_found", t("Chat não encontrado."), 404, { requestId });

  const { nome, ligado, ...aparencia } = pedido.data;
  const metadata = {
    ...(atual.metadata && typeof atual.metadata === "object" ? (atual.metadata as object) : {}),
    webchat: configDoChatSchema.parse({ ...lerConfigDoChat(atual.metadata), ...aparencia }),
  };
  const { data, error } = await createAdminClient()
    .from("channel_sessions")
    .update({
      metadata,
      ...(nome ? { display_name: nome } : {}),
      ...(ligado === undefined ? {} : { status: ligado ? "WORKING" : "STOPPED" }),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", atual.id)
    .select(COLUNAS_DO_CHAT)
    .single();
  if (error || !data)
    return fail("internal_error", error?.message ?? "update_failed", 500, { requestId });

  void audit({
    action: "channel.webchat_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "channel_session",
    resourceId: atual.id,
    requestId,
    metadata: { campos: Object.keys(pedido.data) },
  });
  return ok(paraATela(data as unknown as LinhaDoChat), { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "webchat" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const { id } = await ctx.params;
  const atual = await lerChat(authz.org.orgId, id);
  if (!atual) return fail("not_found", t("Chat não encontrado."), 404, { requestId });

  const agora = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("channel_sessions")
    .update({ archived_at: agora, status: "STOPPED", updated_at: agora })
    .eq("organization_id", authz.org.orgId)
    .eq("id", atual.id);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "channel.archived",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "channel_session",
    resourceId: atual.id,
    requestId,
    metadata: { canal: "chat_no_site" },
  });
  return ok({ id: atual.id, removido: true }, { requestId });
}
