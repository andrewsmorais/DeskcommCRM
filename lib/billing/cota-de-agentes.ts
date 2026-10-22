/**
 * Quantos agentes de IA o plano permite (`PLANOS_COMERCIAIS[plano].agentes_ia`).
 *
 * Conta os agentes NÃO arquivados da organização: arquivar libera a vaga. Só a
 * CRIAÇÃO (criar e duplicar) é barrada; quem já tem mais agentes que o plano
 * novo permite (fez downgrade) não perde nada, só não cria outro.
 *
 * O super-admin e a sessão de suporte passam, e com `EXIGIR_ASSINATURA=false`
 * (instalação sem venda) não há cota. A organização vem da sessão validada,
 * nunca do corpo da requisição.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { canUse, getOrganizationBilling } from "@/lib/billing";
import { assinaturaExigida } from "@/lib/billing/exigencia";

export type CotaDeAgentes =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 503;
      code: "billing_limit" | "billing_unavailable";
      message: string;
    };

export function mensagemDaCotaDeAgentes(plano: string | null, limite: number): string {
  if (limite <= 0 || !plano) {
    return "Escolha um plano para criar agentes de IA. Veja em Configurações › Plano e cobrança.";
  }
  const agentes = limite === 1 ? "1 agente de IA" : `${limite} agentes de IA`;
  return `O plano ${plano} permite ${agentes}. Para criar outro, mude de plano em Configurações › Plano e cobrança ou arquive um agente que não usa mais.`;
}

export async function conferirCotaDeAgentes(
  admin: SupabaseClient,
  orgId: string,
  opts: { isento?: boolean; ambiente?: Record<string, string | undefined> } = {},
): Promise<CotaDeAgentes> {
  if (opts.isento || !assinaturaExigida(opts.ambiente)) return { ok: true };

  const { count, error } = await admin
    .from("ai_agents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("archived_at", null);
  if (error || count === null) {
    return {
      ok: false,
      status: 503,
      code: "billing_unavailable",
      message: "Não foi possível conferir quantos agentes o seu plano permite. Tente novamente.",
    };
  }

  const leitura = await getOrganizationBilling(orgId);
  if (!leitura.ok) {
    return {
      ok: false,
      status: 503,
      code: "billing_unavailable",
      message: "Não foi possível confirmar o seu plano. Tente novamente em instantes.",
    };
  }
  const check = canUse(leitura.billing, "agentes_ia", count);
  if (check.ok) return { ok: true };
  return {
    ok: false,
    status: 403,
    code: "billing_limit",
    message: mensagemDaCotaDeAgentes(leitura.billing?.plan_name ?? null, check.limite),
  };
}
