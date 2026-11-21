/**
 * Venda ganha → Taboola, pelo postback servidor-a-servidor (S2S).
 *
 * Fonte: developers.taboola.com/pixel/docs/the-postback-url e
 * s2s-manual-integration, conferidas em 20/11/2026 —
 * `trc.taboola.com/actions-handler/log/3/s2s-action` com
 * `click-id` (com hífen), `name`, e opcionais `revenue`, `currency`, `orderid`.
 *
 *   - O Taboola põe o código do clique no anúncio como `tblci` por padrão; é o
 *     que a rota do link rastreável guarda e o que volta aqui em `click-id`;
 *   - `name` é o NOME DO EVENTO que o anunciante cadastrou no Taboola Ads
 *     (sensível a maiúsculas). Ele mora em `dataset_id` da conexão: o Taboola
 *     não usa token, e o nome do evento é o "para onde" do envio;
 *   - não há modo de teste na API; o código de teste da tela é ignorado aqui.
 */
import { logger } from "@/lib/logger";

import { chamar, pelaSituacaoHttp, recusaSeNaoForCompra } from "../envio-http";
import type {
  ConversaoOffline,
  CredencialDeConversao,
  ResultadoDeEnvio,
  TransporteDeConversao,
} from "../types";

export function urlDoTaboola(credencial: CredencialDeConversao, conversao: ConversaoOffline): string {
  const q = new URLSearchParams({
    "click-id": conversao.cliqueDeOrigem,
    name: credencial.datasetId,
    revenue: ((conversao.valorCentavos ?? 0) / 100).toFixed(2),
    currency: conversao.moeda.toUpperCase(),
    orderid: conversao.eventoId,
  });
  return `https://trc.taboola.com/actions-handler/log/3/s2s-action?${q.toString()}`;
}

async function enviar(
  credencial: CredencialDeConversao,
  conversao: ConversaoOffline,
): Promise<ResultadoDeEnvio> {
  const recusa = recusaSeNaoForCompra(conversao.evento, conversao.valorCentavos);
  if (recusa) return recusa;

  const r = await chamar(urlDoTaboola(credencial, conversao), { method: "GET" });
  if (r.tipo === "falha") return { tipo: "transitorio", detalhe: r.detalhe };
  if (r.status >= 200 && r.status < 300) return { tipo: "ok" };

  logger.warn("[conversoes.taboola] envio recusado", { status: r.status, leadId: conversao.leadId });
  return pelaSituacaoHttp(r.status, r.texto.slice(0, 300) || "recusado");
}

export const transporteTaboola: TransporteDeConversao = { plataforma: "taboola_ads", enviar };
