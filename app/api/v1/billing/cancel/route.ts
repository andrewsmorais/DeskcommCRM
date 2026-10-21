import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { getOrganizationBilling } from "@/lib/billing";
import { deleteSubscription } from "@/lib/asaas";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

export const dynamic = "force-dynamic";

export async function POST() {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("admin", { requestId, resource: "subscription" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  try {
    const leitura = await getOrganizationBilling(orgId);
    if (!leitura.ok)
      return fail(
        "billing_unavailable",
        "Não foi possível consultar sua assinatura. Tente novamente antes de cancelar.",
        503,
        { requestId },
      );
    const billing = leitura.billing;
    if (!billing) return fail("not_found", "Assinatura não encontrada.", 404, { requestId });
    if (!billing.subscription_id || !billing.updated_at)
      return fail(
        "billing_unavailable",
        "Não foi possível confirmar sua assinatura. Tente novamente.",
        503,
        { requestId },
      );
    if (billing.status === "canceled")
      return ok({ access_until: billing.current_period_end }, { requestId });

    if (billing.asaas_subscription_id) await deleteSubscription(billing.asaas_subscription_id);
    const status = ["suspended", "past_due", "pending"].includes(billing.status)
      ? billing.status
      : "canceled";
    const { data, error } = await createAdminClient()
      .from("subscriptions")
      .update({
        status,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId)
      .eq("id", billing.subscription_id)
      .eq("updated_at", billing.updated_at)
      .select("id");
    if (error || data?.length !== 1)
      return fail(
        "billing_unavailable",
        "A recorrência foi cancelada, mas a confirmação local mudou durante a operação. Atualize a página para conferir.",
        503,
        { requestId },
      );
    void audit({
      action: "billing.subscription_canceled",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "subscription",
      resourceId: billing.subscription_id,
      requestId,
      bypassedRls: true,
    });
    return ok(
      { access_until: billing.is_active ? billing.current_period_end : null },
      { requestId },
    );
  } catch {
    return fail(
      "upstream_unavailable",
      "Não foi possível confirmar o cancelamento. Confira Plano e cobrança antes de tentar novamente.",
      503,
      { requestId },
    );
  }
}
