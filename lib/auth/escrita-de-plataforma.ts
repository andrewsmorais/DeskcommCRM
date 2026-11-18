/**
 * A conferência de ESCRITA de instância para rotas de API: o que o dono do
 * servidor faz que mexe na instalação inteira (hoje: pedir atualização, volta
 * ou força ao agente do host).
 *
 * `is_platform_admin` sozinho não basta. Ele é verdadeiro para qualquer linha
 * viva de `platform_admins` — inclusive a de escopo `support_readonly` — e em
 * qualquer nível de sessão. A auditoria de 18/11 (achado 2) mediu a rota de
 * atualização aceitando os dois casos, enquanto as outras escritas de
 * instância (extensões, `escritaDeAdminOuRecusa`, `fn_support_write_allowed`)
 * recusavam. Aqui moram as mesmas três perguntas, na mesma ordem:
 *
 *  1. é dono de plataforma, fora do modo suporte?
 *  2. o escopo é `full`?
 *  3. a sessão provou a verificação em duas etapas, quando a política exige
 *     ou quando a pessoa tem fator cadastrado (`mfaEmDivida`)?
 *
 * A leitura de `platform_admins` é pelo client de SESSÃO: a policy
 * `platform_admins_self` só mostra a própria linha, então não há como ler a
 * de outra pessoa por aqui.
 */
import { fail } from "@/lib/api/wrappers";
import { mfaEmDivida, sessionAal } from "@/lib/auth/server";
import type { AuthUser } from "@/lib/auth/types";
import { MENSAGEM_DA_RECUSA_DE_ESCRITA } from "@/lib/auth/recusa-de-escrita-de-admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

/**
 * `null` quando a escrita de instância está liberada para esta sessão; senão,
 * a resposta pronta (403, ou 503 quando a permissão não pôde ser lida).
 */
export async function recusaDeEscritaDePlataforma(
  user: AuthUser,
  recusaPadrao = "Só o dono do servidor pode fazer isto.",
): Promise<Response | null> {
  const t = (texto: string) => traduzir(texto, user.idioma);
  if (!user.is_platform_admin || user.support) {
    return fail("forbidden", t(recusaPadrao), 403);
  }
  const db = await createClient();
  const { data: plataforma, error } = await db
    .from("platform_admins")
    .select("scope, mfa_required")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    return fail("upstream_unavailable", t("Não foi possível confirmar a permissão de acesso."), 503);
  }
  if (!plataforma || plataforma.scope !== "full") {
    return fail("forbidden", t(MENSAGEM_DA_RECUSA_DE_ESCRITA.forbidden_scope), 403);
  }
  const politicaExige = plataforma.mfa_required === true && (await sessionAal()) !== "aal2";
  if (politicaExige || (await mfaEmDivida())) {
    return fail("mfa_required", t(MENSAGEM_DA_RECUSA_DE_ESCRITA.mfa_required), 403);
  }
  return null;
}
