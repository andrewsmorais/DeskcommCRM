import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Quem põe ou troca o telefone de uma ficha decide para onde vão as respostas
 * do cliente (a resposta volta pelo número da última mensagem recebida, e o
 * principal é o destino de sempre). Por isso só pode mexer quem enxerga TODAS
 * as conversas da ficha.
 *
 * Auditoria de 18/11, achado 13: um atendente que não via a conversa de outro
 * colega (`visibility_mode` restrito) acrescentava o PRÓPRIO WhatsApp à ficha e
 * passava a receber as respostas da IA ao cliente.
 *
 * A régua é a mesma da leitura das conversas: o que o login enxerga (RLS) tem de
 * ser tudo o que existe. Compara a contagem do cliente de sessão com a do
 * administrativo, que filtra organização e ficha explicitamente.
 *
 * Quem lê tudo (gerente, administrador, visibilidade "todas") passa sem custo
 * extra além das duas contagens.
 */
export async function veTodasAsConversasDaFicha(args: {
  sessao: SupabaseClient;
  admin: SupabaseClient;
  organizationId: string;
  contactId: string;
}): Promise<boolean> {
  const contar = (db: SupabaseClient) =>
    db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", args.organizationId)
      .eq("contact_id", args.contactId);
  const [todas, visiveis] = await Promise.all([contar(args.admin), contar(args.sessao)]);
  if (todas.error) throw new Error(todas.error.message);
  if (visiveis.error) throw new Error(visiveis.error.message);
  return (visiveis.count ?? 0) >= (todas.count ?? 0);
}
