/**
 * EXTRAS COBRADOS À PARTE — prospecção, ligações e nota de voz.
 *
 * Nenhum plano os inclui: cada uso gasta dinheiro de fora (busca paga, minuto
 * de telefone, voz sintetizada). O dono da plataforma liga o extra para UMA
 * organização em Admin › Organizações (coluna `subscriptions.extras`, migration
 * 0562, que só a service role escreve) e cobra à parte.
 *
 * As réguas são as mesmas dos recursos de plano (`./acesso.ts`):
 *   - instalação que não vende planos (`EXIGIR_ASSINATURA` desligado) libera tudo;
 *   - assinatura inativa ou ausente fecha;
 *   - para ROTA (o cliente pediu algo agora), leitura indisponível FECHA;
 *   - para o MOTOR (`extraForaDaOrganizacao`), só o "não contratou" fecha:
 *     um soluço do banco não derruba no meio quem pagou.
 */
import { fail } from "@/lib/api/wrappers";
import { getOrganizationBilling } from "@/lib/billing";
import {
  EXTRAS_COBRADOS_A_PARTE,
  type ExtraCobradoAParte,
} from "@/lib/billing/catalogo";
import { assinaturaExigida } from "@/lib/billing/exigencia";

export type AcessoAoExtra =
  | { ok: true }
  | {
      ok: false;
      code: "billing_unavailable" | "billing_required" | "billing_inactive" | "billing_extra";
      message: string;
      status: 403 | 503;
    };

/** Organização da sessão, token ou evento validado. Nunca aceitar org do body. */
export async function verificarExtra(
  orgId: string,
  extra: ExtraCobradoAParte,
): Promise<AcessoAoExtra> {
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
  if (!(billing.extras ?? []).includes(extra))
    return {
      ok: false,
      code: "billing_extra",
      status: 403,
      message: `${EXTRAS_COBRADOS_A_PARTE[extra].nome} é um extra contratado à parte. Fale com o suporte para ativar.`,
    };
  return { ok: true };
}

/** A mesma régua, na forma de rota: `null` libera; senão, o 403 pronto. */
export async function exigirExtra(
  orgId: string,
  extra: ExtraCobradoAParte,
  opts: { requestId?: string } = {},
): Promise<Response | null> {
  const acesso = await verificarExtra(orgId, extra);
  return acesso.ok ? null : fail(acesso.code, acesso.message, acesso.status, opts);
}

/**
 * Para o MOTOR (worker, cron, turno do agente): o extra está fora desta
 * organização? Fecha em tudo o que é FATO — não contratou, sem assinatura,
 * assinatura parada — e só deixa passar a leitura indisponível: um soluço do
 * banco não pode calar no meio quem pagou.
 */
export async function extraForaDaOrganizacao(
  orgId: string,
  extra: ExtraCobradoAParte,
): Promise<boolean> {
  const acesso = await verificarExtra(orgId, extra);
  return !acesso.ok && acesso.code !== "billing_unavailable";
}
