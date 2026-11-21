/**
 * O pedaço comum dos transportes de conversão que chegaram com a migration 0567
 * (TikTok, Pinterest, Taboola): uma chamada HTTP com tempo-limite e a régua de
 * classificação que os transportes da Meta e do Google já usam.
 *
 *   - falha de rede, 429 e 5xx → `transitorio` (o dreno tenta de novo);
 *   - outro 4xx → `permanente` (credencial ou dado errado: tentar de novo não muda nada).
 *
 * O token NUNCA vai na URL (anti-pattern 12): quem chama põe no cabeçalho.
 */
import { createHash } from "node:crypto";

import type { ResultadoDeEnvio } from "./types";

export const TEMPO_LIMITE_MS = 10_000;

/** SHA-256 em hex do valor já normalizado por quem chama. */
export function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export type RespostaHttp =
  | { tipo: "resposta"; status: number; corpo: unknown; texto: string }
  | { tipo: "falha"; detalhe: string };

export async function chamar(
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string },
): Promise<RespostaHttp> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  } catch (erro) {
    return { tipo: "falha", detalhe: erro instanceof Error ? erro.message : "falha de rede" };
  }
  const texto = await resposta.text().catch(() => "");
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Corpo não-JSON (gateway, WAF, ou a plataforma que responde texto): fica o texto.
  }
  return { tipo: "resposta", status: resposta.status, corpo, texto };
}

/** A régua de status HTTP comum, para quando o corpo não decidiu. */
export function pelaSituacaoHttp(status: number, mensagem: string): ResultadoDeEnvio {
  if (status === 429 || status >= 500) return { tipo: "transitorio", detalhe: `${status}: ${mensagem}` };
  return { tipo: "permanente", detalhe: `${status}: ${mensagem}` };
}

/** Só compras com valor: os três transportes reportam venda, não etapa nem qualificação. */
export function recusaSeNaoForCompra(
  evento: string,
  valorCentavos: number | null,
): ResultadoDeEnvio | null {
  if (evento !== "Purchase" || valorCentavos === null)
    return { tipo: "permanente", detalhe: "Este transporte aceita apenas compras com valor." };
  return null;
}
