/**
 * Quanto o servidor espera o WAHA num envio de MÍDIA (vídeo e áudio passam por
 * `convert`, e o WAHA baixa a URL do Storage antes de responder).
 *
 * Mora aqui, sem imports, para o navegador poder ler o número (o envio de mídia
 * pelo inbox espera MAIS que isto — `hooks/inbox/useSendMessage.ts`) sem levar o
 * logger e o cliente do WAHA para o bundle. `lib/waha/client.ts` reexporta.
 */
export const TETO_DE_MIDIA_MS = 30_000;
