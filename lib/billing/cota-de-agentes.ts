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
import { comReservaDeCota, ErroDaReservaDeCota } from "@/lib/billing/reserva";

export type CotaDeAgentes =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 409 | 503;
      code: "billing_limit" | "billing_unavailable" | "conflict";
      message: string;
    };

export type RecusaDaCotaDeAgentes = Exclude<CotaDeAgentes, { ok: true }>;

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

/**
 * Conta E cria dentro da MESMA reserva de cota da organização.
 *
 * `conferirCotaDeAgentes` sozinha é "confere-e-depois-age": a contagem e o
 * INSERT são duas idas ao banco sem nada entre elas, e N pedidos simultâneos
 * no limite viam todos a mesma contagem e criavam todos — o plano de 1 agente
 * terminava com N. A reserva (`comReservaDeCota`, a mesma de funis, números e
 * equipe) serializa a contagem e a criação por organização. Sem venda de
 * planos, ou para quem é isento, não há cota e não há reserva.
 */
export async function criarDentroDaCotaDeAgentes<R, C>(
  admin: SupabaseClient,
  orgId: string,
  opts: { isento?: boolean; ambiente?: Record<string, string | undefined> },
  recusar: (recusa: RecusaDaCotaDeAgentes) => R,
  criar: () => Promise<C>,
): Promise<R | C> {
  if (opts.isento || !assinaturaExigida(opts.ambiente)) return criar();
  try {
    return await comReservaDeCota<R | C>(orgId, "agentes", async () => {
      const cota = await conferirCotaDeAgentes(admin, orgId, opts);
      if (!cota.ok) return recusar(cota);
      return criar();
    });
  } catch (erro) {
    if (!(erro instanceof ErroDaReservaDeCota)) throw erro;
    return recusar(
      erro.status === 409
        ? { ok: false, status: 409, code: "conflict", message: erro.message }
        : { ok: false, status: 503, code: "billing_unavailable", message: erro.message },
    );
  }
}
