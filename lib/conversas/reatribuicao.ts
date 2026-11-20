/**
 * REATRIBUIÇÃO AUTOMÁTICA (migration 0514) — a regra da Umbler Talk que tira o
 * atendente da conversa quando o contato escreve e ele está offline (ou sempre).
 *
 * Decisão PURA aqui; o efeito fica no handler (`reatribuicao.handler.ts`).
 */
export type RegraDeReatribuicao = "desligada" | "offline" | "sempre";

export function deveReatribuir(regra: string | null | undefined, disponivel: boolean): boolean {
  if (regra === "sempre") return true;
  if (regra === "offline") return !disponivel;
  return false;
}
