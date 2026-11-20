/**
 * Leitura das preferências de conversa e da assinatura de quem envia — o lado
 * servidor de `lib/conversas/preferencias.ts`.
 *
 * Quem assina é decidido AQUI, nunca pelo corpo do pedido: o corpo só diz "quero
 * assinar" (a chave do campo de mensagem); o nome sai do perfil do usuário da
 * sessão, e a empresa pode forçar ou proibir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deveAssinar,
  lerPreferenciasDeConversa,
  nomeQueAssina,
  PREFERENCIAS_PADRAO,
  type PreferenciasDeConversa,
} from "./preferencias";

export async function carregarPreferenciasDeConversa(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PreferenciasDeConversa> {
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  // Falha de leitura não derruba o envio: vale o padrão (ninguém é obrigado a
  // assinar, ninguém é proibido).
  if (error || !data) return PREFERENCIAS_PADRAO;
  return lerPreferenciasDeConversa((data as { settings?: unknown }).settings);
}

/**
 * O nome que assina a mensagem de quem está na sessão, ou `null` quando ela não
 * sai assinada. `supabase` é o client da SESSÃO: o perfil lido é o do próprio
 * usuário logado.
 */
export async function assinaturaDaSessao(
  supabase: SupabaseClient,
  organizationId: string,
  pediu: boolean | undefined,
): Promise<string | null> {
  const prefs = await carregarPreferenciasDeConversa(supabase, organizationId);
  if (!deveAssinar(prefs.assinatura, pediu)) return null;
  const { data } = await supabase.auth.getUser();
  return nomeQueAssina(data.user?.user_metadata as Record<string, unknown> | undefined);
}
