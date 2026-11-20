/**
 * VISIBILIDADE DA CONVERSA (migration 0510) — uma régua só para quem LISTA,
 * quem CONTA e quem GRAVA.
 *
 * Como o card "Visibilidade da conversa" da Umbler Talk: a conversa oculta sai
 * da caixa de entrada sem fechar o atendimento, e aparece no filtro "Ocultas".
 *
 *   visivel              — como sempre foi;
 *   oculta               — fica oculta até alguém mostrar;
 *   oculta_ate_mensagem  — volta sozinha quando o contato escreve (gatilho
 *                          `trg_reexibir_conversa_oculta`, no banco).
 *
 * O filtro da lista (`?ocultas=`) e o da contagem das abas aplicam a MESMA
 * função, para o número da aba nunca contar o que a lista não mostra.
 */
export const VISIBILIDADES = ["visivel", "oculta", "oculta_ate_mensagem"] as const;
export type Visibilidade = (typeof VISIBILIDADES)[number];

/**
 * O que a lista pede sobre as ocultas:
 *   excluir (padrão) — a caixa de entrada, sem as ocultas;
 *   so               — o filtro "Ocultas";
 *   incluir          — tudo (integrações que querem a lista inteira).
 */
export const FILTROS_DE_OCULTAS = ["excluir", "so", "incluir"] as const;
export type FiltroDeOcultas = (typeof FILTROS_DE_OCULTAS)[number];

/** Valor da URL → filtro. Ausente ou desconhecido vira o padrão (sem as ocultas). */
export function filtroDeOcultas(cru: string | null | undefined): FiltroDeOcultas {
  return (FILTROS_DE_OCULTAS as readonly string[]).includes(cru ?? "")
    ? (cru as FiltroDeOcultas)
    : "excluir";
}

type ComFiltro<Q> = { eq(coluna: string, valor: string): Q; neq(coluna: string, valor: string): Q };

/** Aplica o filtro de ocultas numa consulta do PostgREST (lista ou contagem). */
export function aplicarOcultas<Q extends ComFiltro<Q>>(query: Q, filtro: FiltroDeOcultas): Q {
  if (filtro === "excluir") return query.eq("visibilidade", "visivel");
  if (filtro === "so") return query.neq("visibilidade", "visivel");
  return query;
}
