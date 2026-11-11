/**
 * O link de exportação do ponto de vista de quem o ENTREGA (botão e e-mail).
 *
 * `token.ts` é puro e não conhece o ambiente; aqui entra o segredo e a URL
 * pública. Sem segredo configurado devolve `null` — e quem chama trata: o botão
 * mostra erro, o aviso por e-mail não é enviado. Nunca se manda link sem
 * assinatura, nem se inventa um segredo padrão.
 */
import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { env } from "@/lib/env";

import { assinarLink } from "./token";

/**
 * ⚠️ NUNCA `INTERNAL_CRON_SECRET` nem `INTERNAL_SECRET`, que era o que estava
 * aqui. Os dois são o Bearer que `autorizaCron` aceita e que o operador cola no
 * agendador externo — e o link carrega a organização DENTRO dele: quem tivesse a
 * credencial do relógio fabricava o link de qualquer organização e baixava o ZIP
 * inteiro dela. O porquê da chave atual está em `lib/auth/chave-de-assinatura.ts`.
 */
export function segredoDaExportacao(): string {
  return chaveDeAssinatura(ROTULOS_DE_ASSINATURA.exportacao);
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
