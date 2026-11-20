/**
 * Satisfação dos últimos 30 dias por fluxo, a partir do passo "Pedir para
 * avaliar" (`chatbot_avaliacoes`). Mostrada no cartão de cada fluxo na lista
 * de chatbots. Lê com o client da SESSÃO: a RLS da tabela já limita à org.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SatisfacaoDoFluxo = { media: number; total: number };

/** A nota vai para a escala de 5 antes da média: o fluxo pode ter mudado de escala. */
export function mediaPorFluxo(
  notas: { flow_id: string | null; nota: number; escala: string | null }[],
): Record<string, SatisfacaoDoFluxo> {
  const saida: Record<string, SatisfacaoDoFluxo> = {};
  for (const n of notas) {
    if (!n.flow_id) continue;
    const emCinco = n.escala === "0_10" ? n.nota / 2 : n.nota;
    const atual = saida[n.flow_id] ?? { media: 0, total: 0 };
    atual.media = (atual.media * atual.total + emCinco) / (atual.total + 1);
    atual.total += 1;
    saida[n.flow_id] = atual;
  }
  return saida;
}

export async function satisfacaoDosFluxos(
  db: SupabaseClient,
  organizationId: string,
  agora: Date = new Date(),
): Promise<Record<string, SatisfacaoDoFluxo>> {
  const desde = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
  const { data } = await db
    .from("chatbot_avaliacoes")
    .select("flow_id, nota, escala")
    .eq("organization_id", organizationId)
    .not("nota", "is", null)
    .gte("created_at", desde)
    .limit(5000);
  return mediaPorFluxo((data ?? []) as { flow_id: string | null; nota: number; escala: string | null }[]);
}
