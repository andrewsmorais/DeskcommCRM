import { getOrganizationBilling } from "@/lib/billing";
import { assinaturaExigida } from "@/lib/billing/exigencia";
import { fail } from "@/lib/api/wrappers";
import { PLANOS_COMERCIAIS, RECURSOS_DO_PLANO, planoInclui, type RecursoDoPlano } from "./catalogo";

export type AcessoAoRecurso =
  | { ok: true }
  | {
      ok: false;
      code: "billing_unavailable" | "billing_required" | "billing_inactive" | "billing_feature";
      message: string;
      status: 403 | 503;
    };

/** Organização da sessão, token ou evento validado. Nunca aceitar org do body. */
export async function verificarRecursoDoPlano(
  orgId: string,
  recurso: RecursoDoPlano,
): Promise<AcessoAoRecurso> {
  // Instalação que não vende planos: nenhum recurso depende de plano.
  if (!assinaturaExigida()) return { ok: true };
  const leitura = await getOrganizationBilling(orgId);
  if (!leitura.ok)
    return {
      ok: false,
      code: "billing_unavailable",
      status: 503,
      message: "Não foi possível confirmar o plano. Tente novamente em instantes.",
    };
  const billing = leitura.billing;
  if (!billing)
    return {
      ok: false,
      code: "billing_required",
      status: 403,
      message: "Vincule um plano em Configurações → Plano e cobrança para usar este recurso.",
    };
  if (!billing.is_active)
    return {
      ok: false,
      code: "billing_inactive",
      status: 403,
      message:
        "A assinatura não está ativa. Confira Configurações → Plano e cobrança. Seus dados foram preservados.",
    };
  if (!planoInclui(billing.plan_slug, recurso)) {
    const oferta = RECURSOS_DO_PLANO[recurso];
    return {
      ok: false,
      code: "billing_feature",
      status: 403,
      message: `${oferta.nome} está disponível a partir do plano ${PLANOS_COMERCIAIS[oferta.desde].nome}. Confira Configurações → Plano e cobrança.`,
    };
  }
  return { ok: true };
}

export async function exigirRecursoDoPlano(
  orgId: string,
  recurso: RecursoDoPlano,
  opts: { requestId?: string } = {},
) {
  const acesso = await verificarRecursoDoPlano(orgId, recurso);
  return acesso.ok ? null : fail(acesso.code, acesso.message, acesso.status, opts);
}

/**
 * Para TELAS: o plano atual simplesmente não inclui o recurso? Só
 * `billing_feature` tranca a tela — assinatura inativa ou leitura indisponível
 * já têm aviso próprio (BillingBanner) e não devem esconder dados.
 */
export async function recursoForaDoPlano(orgId: string, recurso: RecursoDoPlano): Promise<boolean> {
  const acesso = await verificarRecursoDoPlano(orgId, recurso);
  return !acesso.ok && acesso.code === "billing_feature";
}
