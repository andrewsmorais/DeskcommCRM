/**
 * GET /api/v1/billing/recursos — o que o plano da organização ativa inclui.
 *
 * Para TELAS marcarem antes de o cliente tentar ("Plano Impulso" no pacote,
 * no passo do chatbot). Quem barra de verdade são as rotas e o runtime
 * (`lib/billing/acesso.ts`); esta leitura não concede nada.
 * Organização vem da sessão (requireRole), nunca de query string.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { getOrganizationBilling } from "@/lib/billing";
import { assinaturaExigida } from "@/lib/billing/exigencia";
import { RECURSOS_DO_PLANO, planoInclui, type RecursoDoPlano } from "@/lib/billing/catalogo";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId });
  if (!auth.ok) return auth.response;

  const chaves = Object.keys(RECURSOS_DO_PLANO) as RecursoDoPlano[];
  // Instalação que não vende planos: tudo incluído.
  if (!assinaturaExigida()) {
    return ok(
      { plano: null, recursos: Object.fromEntries(chaves.map((k) => [k, true])), limites: null },
      { requestId },
    );
  }
  const leitura = await getOrganizationBilling(auth.org.orgId);
  if (!leitura.ok)
    return fail("billing_unavailable", "Não foi possível confirmar o plano.", 503, { requestId });
  const billing = leitura.billing;
  return ok(
    {
      plano: billing ? { slug: billing.plan_slug, nome: billing.plan_name } : null,
      recursos: Object.fromEntries(
        chaves.map((k) => [k, Boolean(billing && planoInclui(billing.plan_slug, k))]),
      ),
      limites: billing?.limits ?? null,
    },
    { requestId },
  );
}
