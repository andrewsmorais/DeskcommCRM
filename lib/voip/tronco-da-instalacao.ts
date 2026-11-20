import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O tronco SIP da INSTALAÇÃO (`VOIP_TRUNK_ENDPOINT`, com o número de saída
 * `VOIP_DEFAULT_CALLER_ID`) é a conta de telefonia de quem opera a instalação.
 *
 * Numa instalação de uma organização só (o self-host comum) ele é dela, e a
 * ligação sai por ele quando a organização ainda não cadastrou o próprio tronco.
 * Numa instalação com várias organizações, sair por ele faria qualquer gerente
 * de qualquer empresa ligar — para qualquer destino — na conta e com o número do
 * operador. Ali ele só vale quando o operador liga de propósito:
 * `VOIP_TRUNK_COMPARTILHADO=ligado`.
 *
 * Leitura indisponível NÃO libera: na dúvida, a ligação pede o tronco próprio.
 */
export async function troncoDaInstalacaoLiberado(): Promise<boolean> {
  if (!process.env.VOIP_TRUNK_ENDPOINT) return false;
  if (process.env.VOIP_TRUNK_COMPARTILHADO === "ligado") return true;
  try {
    const { count, error } = await createAdminClient()
      .from("organizations")
      .select("id", { count: "exact", head: true });
    return !error && count === 1;
  } catch {
    return false;
  }
}
