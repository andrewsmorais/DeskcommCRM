import type pg from "pg";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationBilling } from "@/lib/billing";
import {
  assinaturaExigida,
  decidirAcessoPeloPlano,
  type AcessoPeloPlano,
} from "@/lib/billing/exigencia";
import { fail } from "@/lib/api/wrappers";
import { PLANOS_COMERCIAIS, RECURSOS_DO_PLANO, planoInclui, type RecursoDoPlano } from "./catalogo";

/**
 * SEM ASSINATURA ATIVA, SEM IA — a régua do turno do agente, para quem não é o
 * turno do agente.
 *
 * É a MESMA decisão que `inbound-turn.ts` e `lib/chatbot/executar.ts` aplicam
 * (`decidirAcessoPeloPlano` sobre `getOrganizationBilling`), e não
 * `verificarRecursoDoPlano`: aquela cobra um RECURSO e fecha quando a leitura do
 * plano falha; esta só pergunta "a organização tem assinatura ativa?" e LIBERA
 * quando a leitura falha — um soluço do banco não pode calar quem paga
 * (`lib/billing/exigencia.ts`).
 *
 * Existe porque a regra estava escrita em dois caminhos e faltava nos outros:
 * as regras de automação, o rascunho do modo assistido, o teste do agente e as
 * consultas à IA pela tela chamavam o modelo da chave da plataforma para quem
 * nunca pagou.
 *
 * Sem `EXIGIR_ASSINATURA` nada é lido: instalação que não vende planos não paga
 * uma consulta ao banco por evento (a decisão seria `nao_exigido` de todo jeito).
 */
export async function acessoPeloPlanoDaOrganizacao(
  orgId: string,
  /** O motor passa o pool que já tem: a prévia do agente não faz HTTP nenhum. */
  db?: Pick<pg.Pool, "query">,
): Promise<AcessoPeloPlano> {
  // Plano vencido já barra sem tocar no banco do motor (o turno nem abre o
  // pool: tests/unit/ia-sem-assinatura-no-motor.test.ts).
  const exigida = assinaturaExigida();
  const peloPlano = exigida ? decidirAcessoPeloPlano(await getOrganizationBilling(orgId)) : null;
  if (peloPlano && !peloPlano.liberado) return peloPlano;
  // A suspensão vale com ou sem EXIGIR_ASSINATURA: é ato da plataforma
  // (Admin › Organizações), não da camada comercial. Como na Umbler Talk, conta
  // suspensa não atende — a IA, o chatbot e as automações param juntos; as
  // mensagens que chegam continuam sendo gravadas.
  if (await organizacaoSuspensa(orgId, db)) return { liberado: false, motivo: "suspensa" };
  return peloPlano ?? { liberado: true, motivo: "nao_exigido" };
}

/**
 * A organização foi suspensa pela plataforma? Leitura indisponível NÃO suspende
 * (mesma régua da leitura do plano): um soluço do banco não cala quem paga.
 */
export async function organizacaoSuspensa(
  orgId: string,
  db?: Pick<pg.Pool, "query">,
): Promise<boolean> {
  try {
    if (db) {
      const { rows } = await db.query<{ status: string | null }>(
        "select status from public.organizations where id = $1",
        [orgId],
      );
      return rows[0]?.status === "suspended";
    }
    const { data, error } = await createAdminClient()
      .from("organizations")
      .select("status")
      .eq("id", orgId)
      .maybeSingle();
    if (error) return false;
    return data?.status === "suspended";
  } catch {
    return false;
  }
}

/**
 * A mesma régua, na forma de rota: `null` libera; senão, o 403 pronto.
 *
 * Para toda rota que chama modelo pela tela (rascunho, teste do agente,
 * consulta à IA). Fica DEPOIS da autenticação — a organização vem do
 * `requireRole`, nunca do corpo — e ANTES de qualquer escrita ou chamada paga.
 * Os códigos são os de `verificarRecursoDoPlano`, que a tela já sabe ler.
 */
export async function exigirAssinaturaAtiva(
  orgId: string,
  opts: { requestId?: string } = {},
): Promise<Response | null> {
  const acesso = await acessoPeloPlanoDaOrganizacao(orgId);
  if (acesso.liberado) return null;
  if (acesso.motivo === "suspensa")
    return fail(
      "org_suspended",
      "Esta organização está suspensa. Fale com o suporte da plataforma.",
      403,
      opts,
    );
  return acesso.motivo === "sem_plano"
    ? fail(
        "billing_required",
        "Vincule um plano em Configurações → Plano e cobrança para usar a inteligência artificial.",
        403,
        opts,
      )
    : fail(
        "billing_inactive",
        "A assinatura não está ativa. Confira Configurações → Plano e cobrança. Seus dados foram preservados.",
        403,
        opts,
      );
}

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
