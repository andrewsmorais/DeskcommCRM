import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH /api/v1/team/[user_id]/telefone { ocultar } — liga ou desliga o
 * TELEFONE OCULTO de uma pessoa da equipe (migration 0517), como o "Ocultar
 * número de telefone" da Umbler Talk. Gerente ou acima.
 *
 * Só vale para atendente e "Somente leitura": gerente e administrador decidem
 * sobre a equipe e veem o número sempre — esconder dele seria esconder de quem
 * pode desligar a regra. A escrita é com a service role, filtrada pela
 * organização da sessão (a RLS de `user_organizations` só deixa o admin alterar).
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ user_id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const { user_id: alvo } = await ctx.params;
  const pedido = z.object({ ocultar: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(alvo).success || !pedido.success)
    return fail("validation_failed", t("Pedido inválido."), 422, { requestId });

  const admin = createAdminClient();
  const { data: membro } = await admin
    .from("user_organizations")
    .select("id, role, revoked_at")
    .eq("organization_id", authz.org.orgId)
    .eq("user_id", alvo)
    .maybeSingle();
  const m = membro as { id: string; role: string; revoked_at: string | null } | null;
  if (!m || m.revoked_at) return fail("not_found", t("Membro não encontrado."), 404, { requestId });
  if (pedido.data.ocultar && (m.role === "manager" || m.role === "admin"))
    return fail(
      "validation_failed",
      t("Gerente e administrador sempre veem o telefone."),
      422,
      { requestId },
    );

  const { error } = await admin
    .from("user_organizations")
    .update({ ocultar_telefone: pedido.data.ocultar, updated_at: new Date().toISOString() })
    .eq("id", m.id)
    .eq("organization_id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "team.phone_visibility_changed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "membership",
    resourceId: m.id,
    requestId,
    metadata: { ocultar: pedido.data.ocultar },
  });
  return ok({ user_id: alvo, ocultar_telefone: pedido.data.ocultar }, { requestId });
}
