/**
 * As opções do cookie de vínculo do OAuth (mecanismo em `vinculo-oauth.ts`).
 *
 * Separadas do mecanismo porque leem o ambiente: `cookieSecure()` importa
 * `lib/env`, que valida tudo na importação, e o mecanismo puro é importado por
 * testes e módulos que ainda não montaram o ambiente.
 */
import { cookieSecure } from "@/lib/supabase/cookie-secure";

import { VALIDADE_DO_VINCULO_S } from "./vinculo-oauth";

/**
 * As opções do cookie de vínculo — as MESMAS na ida (gravar) e na volta
 * (apagar, com `maxAge: 0`), porque o navegador só apaga o cookie cujo `path`
 * casa com o que foi gravado.
 *
 * - `sameSite: "lax"` É O PONTO: Lax viaja em navegação top-level GET vinda de
 *   outro site, que é exatamente a volta do consentimento. "strict" não viaja,
 *   e o fluxo inteiro volta a falhar sempre.
 * - `secure` sai de `cookieSecure()`, NUNCA `true` literal: um self-host servido
 *   por `http://` existe, e lá o navegador descartaria o cookie.
 * - `path` é o do CALLBACK daquele fluxo: o cookie não viaja para mais nada, e
 *   o de um provedor nunca chega à volta de outro.
 */
export function opcoesDoVinculo(caminhoDoCallback: string, maxAge: number = VALIDADE_DO_VINCULO_S) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: caminhoDoCallback,
    maxAge,
  };
}
