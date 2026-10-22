/**
 * Sem assinatura ativa, sem uso — na tela E no motor do agente.
 *
 * No ChatAI Online a chave de IA é da plataforma: uma organização que se
 * cadastrou e não pagou, ou cujo teste de 7 dias venceu, usava o CRM inteiro e
 * fazia o agente responder no WhatsApp gastando a chave do dono. A faixa de
 * aviso (`BillingBanner`) avisava e não impedia nada.
 *
 * A regra é uma só para os dois lados:
 *   - `ativo`  → libera;
 *   - `sem_plano` (nenhuma assinatura) e `vencido` (`is_active` falso) → bloqueia;
 *   - leitura do plano indisponível → libera. Um soluço do banco não pode
 *     tirar do ar quem paga; a tela já mostra `FalhaNaLeituraDoPlano`.
 *
 * `EXIGIR_ASSINATURA=false` desliga a exigência (instalação self-host sem
 * venda). O padrão é exigir, porque este fork é o SaaS.
 */
import type { BillingReadResult } from "@/lib/billing";

export type AcessoPeloPlano =
  | { liberado: true; motivo: "ativo" | "nao_exigido" | "isento" | "leitura_indisponivel" }
  | { liberado: false; motivo: "sem_plano" | "vencido" };

export function assinaturaExigida(
  ambiente: Record<string, string | undefined> = process.env,
): boolean {
  return (ambiente.EXIGIR_ASSINATURA ?? "true").trim().toLowerCase() !== "false";
}

export function decidirAcessoPeloPlano(
  leitura: BillingReadResult,
  opts: { isento?: boolean; ambiente?: Record<string, string | undefined> } = {},
): AcessoPeloPlano {
  if (!assinaturaExigida(opts.ambiente)) return { liberado: true, motivo: "nao_exigido" };
  if (opts.isento) return { liberado: true, motivo: "isento" };
  if (!leitura.ok) return { liberado: true, motivo: "leitura_indisponivel" };
  if (!leitura.billing) return { liberado: false, motivo: "sem_plano" };
  if (!leitura.billing.is_active) return { liberado: false, motivo: "vencido" };
  return { liberado: true, motivo: "ativo" };
}

/**
 * Telas de `/app` que continuam abertas sem assinatura (a que explica e leva
 * ao plano é `/assinatura`, fora de `/app`): a de cobrança, a de exportar os dados (LGPD — os dados são do cliente, pague
 * ou não) e as da própria conta.
 */
export const ROTAS_ABERTAS_SEM_ASSINATURA = [
  "/app/settings/billing",
  "/app/settings/tenant",
  "/app/settings/profile",
  "/app/settings/security",
] as const;

/** `/app/settings/tenant` abre só a página da organização, não as filhas (WhatsApp, funis...). */
const SO_A_PROPRIA_PAGINA = new Set<string>(["/app/settings/tenant"]);

export function rotaAbertaSemAssinatura(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const limpo = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROTAS_ABERTAS_SEM_ASSINATURA.some(
    (rota) => limpo === rota || (!SO_A_PROPRIA_PAGINA.has(rota) && limpo.startsWith(`${rota}/`)),
  );
}
