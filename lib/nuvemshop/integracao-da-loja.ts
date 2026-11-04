/**
 * De qual organização é esta loja da Nuvemshop — e com que segredo o webhook dela
 * se confere.
 *
 * ⚠️ DUAS LIÇÕES DA AUDITORIA DE SEGURANÇA (04/11/2026), as duas aqui:
 *
 * 1. O SEGREDO É DA INSTALAÇÃO, NÃO DA LINHA. A Nuvemshop assina todo webhook
 *    com o `client_secret` do APP — um valor só, que mora no `.env`
 *    (`NUVEMSHOP_CLIENT_SECRET`). O callback copiava esse valor, cifrado, para a
 *    linha de CADA organização conectada, e as rotas conferiam contra a cópia.
 *    A cópia era legível por qualquer membro, e com a chave única da instalação
 *    virava texto puro por outra porta: com ele, um tenant assinava webhook da
 *    loja de OUTRA organização — inclusive o `store/redact`, que anonimiza todos
 *    os contatos dela. Agora o segredo vem do ambiente, sempre.
 *
 * 2. LOJA AMBÍGUA É ALARME, NÃO "ORGANIZAÇÃO DESCONHECIDA". O `store_id` não é
 *    único entre organizações, e o `.maybeSingle()` transformava duas linhas num
 *    erro que as rotas tratavam como "loja de ninguém" — 200 para o evento (a
 *    Nuvemshop para de reenviar) e 404 para a LGPD. Agora duas linhas viram
 *    `ambigua`, que as rotas respondem com 500 (a Nuvemshop reenvia) e log de
 *    erro para o operador. Linha desconectada não conta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getConfig } from "./config";

export type BuscaDaLoja =
  | { tipo: "achada"; integracao: { id: string; organization_id: string } }
  | { tipo: "nenhuma" }
  | { tipo: "ambigua" }
  | { tipo: "erro"; mensagem: string };

export async function integracaoDaLoja(
  admin: SupabaseClient,
  storeId: string,
): Promise<BuscaDaLoja> {
  const { data, error } = await admin
    .from("tenant_integrations")
    .select("id, organization_id")
    .eq("provider", "nuvemshop")
    .eq("store_metadata->>store_id", storeId)
    .neq("status", "disconnected")
    .limit(2);
  if (error) return { tipo: "erro", mensagem: error.message };
  const linhas = (data ?? []) as { id: string; organization_id: string }[];
  if (linhas.length === 0) return { tipo: "nenhuma" };
  if (linhas.length > 1) return { tipo: "ambigua" };
  return { tipo: "achada", integracao: linhas[0]! };
}

/** O `client_secret` do app desta instalação — o ÚNICO que confere webhook. */
export function segredoDoApp(): string | null {
  return getConfig()?.clientSecret ?? null;
}
