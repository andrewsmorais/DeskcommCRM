/**
 * O link de exportação do ponto de vista de quem o ENTREGA (botão e e-mail).
 *
 * `token.ts` é puro e não conhece o ambiente; aqui entra o segredo e a URL
 * pública. Sem segredo configurado devolve `null` — e quem chama trata: o botão
 * mostra erro, o aviso por e-mail não é enviado. Nunca se manda link sem
 * assinatura, nem se inventa um segredo padrão.
 */
import { env } from "@/lib/env";

import { assinarLink } from "./token";

export function segredoDaExportacao(): string {
  return env.INTERNAL_CRON_SECRET || env.INTERNAL_SECRET || "";
}

/** O caminho relativo — o que o navegador usa dentro do próprio sistema. */
export function caminhoDeExportacao(orgId: string, expiraEm: Date): string | null {
  const token = assinarLink({ orgId, expiraEm }, segredoDaExportacao());
  return token ? `/api/v1/exportacao/${token}` : null;
}

/** O endereço completo — o que vai no e-mail. */
export function urlDeExportacao(orgId: string, expiraEm: Date): string | null {
  const caminho = caminhoDeExportacao(orgId, expiraEm);
  return caminho ? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${caminho}` : null;
}
