/**
 * Estatística por bloco do chatbot (migration 0512) — PURO: soma as linhas
 * diárias e calcula a porcentagem de cada saída sobre as conclusões do bloco.
 */
export type LinhaDeEstatistica = { node_id: string; saida: string; contagem: number };

export type EstatisticaDoBloco = {
  node_id: string;
  total: number;
  saidas: { saida: string; contagem: number; porcentagem: number }[];
};

export function resumirEstatistica(linhas: LinhaDeEstatistica[]): EstatisticaDoBloco[] {
  const porBloco = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    const saidas = porBloco.get(l.node_id) ?? new Map<string, number>();
    saidas.set(l.saida, (saidas.get(l.saida) ?? 0) + Math.max(0, Number(l.contagem) || 0));
    porBloco.set(l.node_id, saidas);
  }
  return [...porBloco.entries()]
    .map(([node_id, saidas]) => {
      const total = [...saidas.values()].reduce((a, b) => a + b, 0);
      return {
        node_id,
        total,
        saidas: [...saidas.entries()]
          .map(([saida, contagem]) => ({
            saida,
            contagem,
            porcentagem: total > 0 ? Math.round((contagem / total) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.contagem - a.contagem),
      };
    })
    .sort((a, b) => b.total - a.total);
}
