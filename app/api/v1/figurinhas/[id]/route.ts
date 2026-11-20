import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * DELETE /api/v1/figurinhas/[id] — tira a figurinha da biblioteca da empresa
 * (a linha e o arquivo). Mensagens já enviadas com ela não mudam: cada envio
 * levou a sua cópia para a pasta da conversa.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("not_found", t("Figurinha não encontrada."), 404, { requestId });

  const admin = createAdminClient();
  const { data: linha } = await admin
    .from("figurinhas")
    .select("id, storage_path")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!linha) return fail("not_found", t("Figurinha não encontrada."), 404, { requestId });
  const { error } = await admin.from("figurinhas").delete().eq("id", id).eq("organization_id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  await admin.storage.from("whatsapp-media").remove([(linha as { storage_path: string }).storage_path]);

  void audit({
    action: "sticker.deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "sticker",
    resourceId: id,
    requestId,
  });
  return ok({ id }, { requestId });
}
