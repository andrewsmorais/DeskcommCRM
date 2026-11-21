/**
 * Venda ganha → Pinterest Conversions API (`checkout`).
 *
 * Fonte: developers.pinterest.com/docs/conversions/event, conferida em
 * 20/11/2026 — `POST https://api.pinterest.com/v5/ad_accounts/{id}/events`,
 * `Authorization: Bearer <token de conversão>`, corpo `{ data: [...] }`.
 *
 *   - `event_name: "checkout"` é a compra concluída (a plataforma não tem
 *     evento chamado "purchase");
 *   - `user_data.click_id` = o `epik` que o Pinterest pôs no link do anúncio;
 *   - `user_data.ph` = SHA-256 de só dígitos, com código do país;
 *   - A API EXIGE `em`, `hashed_maids` ou o par `client_ip_address` +
 *     `client_user_agent`. Conversa de WhatsApp quase nunca tem e-mail, então
 *     o par vem do clique no link rastreável (`clienteDoClique`). Sem ele, a
 *     recusa é nossa e explicada, em vez de um 400 genérico;
 *   - `custom_data.value` vai como TEXTO ("66.95"), como a documentação pede;
 *   - sucesso é `events[0].status === "processed"`: a resposta pode ser 200 com
 *     o evento recusado dentro.
 *
 * Código de teste preenchido na tela = `?test=true` (eventos de teste do
 * Pinterest, que não entram em relatório nem otimização).
 */
import { logger } from "@/lib/logger";

import { chamar, pelaSituacaoHttp, recusaSeNaoForCompra, sha256 } from "../envio-http";
import type {
  ConversaoOffline,
  CredencialDeConversao,
  ResultadoDeEnvio,
  TransporteDeConversao,
} from "../types";

export function urlDoPinterest(credencial: CredencialDeConversao): string {
  const base = `https://api.pinterest.com/v5/ad_accounts/${encodeURIComponent(credencial.datasetId)}/events`;
  return credencial.testEventCode ? `${base}?test=true` : base;
}

export function corpoDoPinterest(conversao: ConversaoOffline) {
  const usuario: Record<string, unknown> = { click_id: conversao.cliqueDeOrigem };
  if (conversao.telefone) usuario.ph = [sha256(conversao.telefone.replace(/\D/g, "").replace(/^0+/, ""))];
  if (conversao.clienteDoClique?.ip) usuario.client_ip_address = conversao.clienteDoClique.ip;
  if (conversao.clienteDoClique?.userAgent) usuario.client_user_agent = conversao.clienteDoClique.userAgent;
  return {
    data: [
      {
        event_name: "checkout",
        action_source: "web",
        event_time: Math.floor(conversao.ocorridoEm.getTime() / 1000),
        event_id: conversao.eventoId,
        user_data: usuario,
        custom_data: {
          currency: conversao.moeda.toUpperCase(),
          value: ((conversao.valorCentavos ?? 0) / 100).toFixed(2),
          order_id: conversao.leadId,
        },
      },
    ],
  };
}

async function enviar(
  credencial: CredencialDeConversao,
  conversao: ConversaoOffline,
): Promise<ResultadoDeEnvio> {
  const recusa = recusaSeNaoForCompra(conversao.evento, conversao.valorCentavos);
  if (recusa) return recusa;
  if (!conversao.clienteDoClique?.ip || !conversao.clienteDoClique?.userAgent) {
    return {
      tipo: "permanente",
      detalhe:
        "O Pinterest exige o IP e o navegador de quem clicou, e este contato não os tem (chegou antes desta versão ou sem passar pelo link rastreável).",
    };
  }

  const r = await chamar(urlDoPinterest(credencial), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${credencial.accessToken}` },
    body: JSON.stringify(corpoDoPinterest(conversao)),
  });
  if (r.tipo === "falha") return { tipo: "transitorio", detalhe: r.detalhe };

  const corpo = (r.corpo ?? {}) as {
    events?: { status?: string; error_message?: string | null }[];
    message?: string;
  };
  const evento = corpo.events?.[0];
  if (r.status >= 200 && r.status < 300 && evento?.status === "processed") return { tipo: "ok" };

  logger.warn("[conversoes.pinterest] envio recusado", { status: r.status, leadId: conversao.leadId });
  const mensagem = evento?.error_message ?? corpo.message ?? r.texto.slice(0, 300);
  if (r.status >= 200 && r.status < 300) return { tipo: "permanente", detalhe: mensagem || "evento recusado" };
  return pelaSituacaoHttp(r.status, mensagem);
}

export const transportePinterest: TransporteDeConversao = { plataforma: "pinterest_ads", enviar };
