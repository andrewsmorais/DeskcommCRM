/**
 * A linha do quadro "Por etiqueta" — montagem PURA, sem banco.
 *
 * A conta inteira é da RPC `fn_tag_metrics` (migration 0558), com a régua da
 * `fn_channel_metrics`: reimplementar média ou mediana aqui seria uma segunda
 * versão da verdade. Este módulo ordena, preserva a ausência e formata.
 *
 * Duas regras que a tela não pode furar:
 *
 * 1. **`null` ≠ `0`** na média e na mediana: "ninguém respondeu" nunca vira
 *    "respondeu na hora zero". Quem pinta usa `formatarDuracao`, que devolve `—`.
 * 2. **Não há total.** Uma conversa com duas etiquetas conta nas duas linhas, então
 *    somar as linhas inflaria o número de conversas — o quadro diz isso na tela
 *    em vez de mostrar um total que mente.
 */
import { formatarDuracao } from "@/lib/metrics/canais";

export { formatarDuracao };

export interface LinhaEtiquetaBruta {
  tag: string;
  conversations_handled: number;
  avg_first_response_seconds: number | null;
  median_first_response_seconds: number | null;
  sem_resposta: number;
}

export type LinhaEtiqueta = LinhaEtiquetaBruta;

function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Descarta linha sem etiqueta, preserva `null` e ordena por volume (desempate pelo nome). */
export function montarLinhasDeEtiqueta(brutas: LinhaEtiquetaBruta[] | null | undefined): LinhaEtiqueta[] {
  if (!Array.isArray(brutas)) return [];
  return brutas
    .filter((b) => typeof b.tag === "string" && b.tag.trim().length > 0)
    .map((b) => ({
      tag: b.tag.trim(),
      conversations_handled: Number(b.conversations_handled) || 0,
      avg_first_response_seconds: numeroOuNulo(b.avg_first_response_seconds),
      median_first_response_seconds: numeroOuNulo(b.median_first_response_seconds),
      sem_resposta: Number(b.sem_resposta) || 0,
    }))
    .sort((a, b) => b.conversations_handled - a.conversations_handled || a.tag.localeCompare(b.tag));
}
