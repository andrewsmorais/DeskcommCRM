/**
 * O CONSUMIDOR dos pedidos da Nuvemshop.
 *
 * O webhook (`app/api/v1/webhooks/nuvemshop/[event]`) só confere a assinatura e
 * grava `nuvemshop.order_*` no `event_log` — responder rápido é o que impede a
 * Nuvemshop de desligar o webhook. Até este arquivo, nada lia esses eventos: a
 * loja conectava, e o pedido não virava contato nem negócio (anti-pattern 3,
 * "evento sem consumidor").
 *
 * Aqui: lê o pedido pela API, monta o aviso (`venda.ts`) e entrega à Captação
 * (`captacao.ts`). Pedido que não move o negócio (sem telefone e sem e-mail, ou
 * numa situação que não é evento) é `skipped` com o motivo, que fica no
 * `event_log` — não-aplicação auditável, não invisível.
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

import { NuvemshopApiError } from "./api-client";
import {
  clienteDaLoja,
  entregarNaCaptacao,
  fonteDaLoja,
  lojaDaOrganizacao,
  marcarTokenRecusado,
} from "./captacao";
import { avisoDoPedido, EVENTOS_DE_PEDIDO } from "./venda";

const CONSUMER_KEY = "nuvemshop.pedido";

function daqui(minutos: number): string {
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

export async function tratarPedidoDaNuvemshop(row: EventRow): Promise<HandlerResult> {
  const r = (status: HandlerResult["status"], detail: string, retry_at?: string): HandlerResult => ({
    consumer_key: CONSUMER_KEY,
    status,
    detail,
    ...(retry_at ? { retry_at } : {}),
  });

  const idDoPedido = row.payload?.id;
  if (typeof idDoPedido !== "number" && typeof idDoPedido !== "string") {
    return r("skipped", "aviso_sem_id_do_pedido");
  }

  const admin = createAdminClient();
  // A organização vem da LINHA (o webhook a resolveu pela loja, com a
  // assinatura conferida) — nunca do corpo.
  const loja = await lojaDaOrganizacao(admin, row.organization_id);
  if (!loja) return r("skipped", "loja_desconectada");
  const storeDoAviso = row.metadata?.store_id;
  if (storeDoAviso !== undefined && String(storeDoAviso) !== loja.storeId) {
    return r("skipped", "loja_trocada");
  }

  const api = await clienteDaLoja(admin, loja);
  if (!api) return r("error", "token_indecifravel");

  let pedido: unknown;
  try {
    pedido = await api.get(`/orders/${encodeURIComponent(String(idDoPedido))}`);
  } catch (err) {
    if (err instanceof NuvemshopApiError) {
      if (err.status === 401 || err.status === 403) {
        await marcarTokenRecusado(admin, loja, `api_${err.status}_ao_ler_pedido`);
        return r("skipped", `loja_recusou_o_token_${err.status}`);
      }
      if (err.status === 404) return r("skipped", "pedido_nao_existe_mais");
      if (err.status === 429) return r("retry", "nuvemshop_429", daqui(2));
    }
    // Rede ou 5xx: conta tentativa (backoff e `dead` no limite).
    return r("error", `leitura_do_pedido: ${(err as Error).message}`);
  }

  const aviso = avisoDoPedido(pedido);
  if (!aviso) return r("skipped", "pedido_sem_evento_ou_sem_contato");

  const fonte = await fonteDaLoja(admin, loja);
  if (!fonte) return r("skipped", "organizacao_sem_funil");

  const entrega = await entregarNaCaptacao(admin, fonte, aviso);
  if (entrega.tipo === "entregue") return r("ok", `${aviso.evento_da_venda}:${entrega.status}`);
  // 429 é ritmo (não conta tentativa); 5xx conta, para não reagendar para sempre.
  if (entrega.tipo === "tentar_depois") {
    return entrega.status === 429
      ? r("retry", entrega.motivo, daqui(2))
      : r("error", `captacao_${entrega.status}:${entrega.motivo}`);
  }
  return r("skipped", `captacao_recusou:${entrega.motivo}`);
}

export const nuvemshopPedidoHandler: EventHandler = {
  key: CONSUMER_KEY,
  events: [...EVENTOS_DE_PEDIDO],
  handle: tratarPedidoDaNuvemshop,
  // Uma ida à API da loja e uma escrita no banco: um minuto basta.
  deadlineMs: 60_000,
};
