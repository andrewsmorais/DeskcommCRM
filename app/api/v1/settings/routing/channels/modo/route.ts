/**
 * PATCH /api/v1/settings/routing/channels/modo — o jeito de distribuir de UM
 * número (migration 0559). `routing_mode: null` volta a seguir a organização.
 *
 * Mesmo portão da rota irmã (`../route.ts`): gerente para cima, plano com
 * distribuição avançada, MFA provado, suporte com escrita. A organização vem da
 * sessão, nunca do corpo; a função do banco repete as travas (definer).
 */
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api/wrappers";
import { channelDistributionModePatchSchema } from "@/lib/schemas/routing";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", {
    requestId,
    resource: "settings_routing",
    allowPlatformAdmin: true,
    plano: "distribuicao_avancada",
  });
  if (!auth.ok) return auth.response;
  if (await mfaEmDivida())
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId });
  const parsed = channelDistributionModePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Confira o número e o jeito de distribuir.", 422, { requestId });

  const db = await createClient();
  const { data, error } = await db.rpc("fn_set_channel_distribution_mode", {
    p_org: auth.org.orgId,
    p_channel: parsed.data.channel_session_id,
    p_mode: parsed.data.routing_mode,
  });
  if (error) {
    if (error.code === "P0002") return fail("not_found", "Número não encontrado.", 404, { requestId });
    if (error.code === "22023")
      return fail("validation_failed", "Jeito de distribuir inválido.", 422, { requestId });
    if (error.code === "42501")
      return fail("forbidden", "Esta sessão não pode alterar a distribuição.", 403, { requestId });
    return fail("internal_error", "Não foi possível salvar. Tente novamente.", 500, { requestId });
  }
  void audit({
    action: "routing.config_changed",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "channel_session",
    resourceId: parsed.data.channel_session_id,
    requestId,
    metadata: { routing_mode: parsed.data.routing_mode },
  });
  return ok(data, { requestId });
}
