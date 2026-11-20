/**
 * Pedido e carrinho abandonado da Nuvemshop → aviso de venda no formato ChatAI.
 *
 * A Nuvemshop é a única loja que NÃO manda o pedido no aviso: o webhook traz só
 * `{ store_id, event, id }`, e o pedido é lido pela API (`GET /orders/{id}`).
 * Carrinho abandonado nem aviso tem — é lido de tempos em tempos
 * (`GET /checkouts`, cron `nuvemshop-checkouts`).
 *
 * As duas leituras viram o MESMO corpo que Wix, Make e Zapier mandam
 * (`evento_da_venda` no topo — `lib/webhooks/lojas.ts`, `lerFormatoChatAI`) e
 * entram pela Captação como qualquer loja. Assim a Nuvemshop herda tudo o que as
 * outras já fazem: contato + negócio, etapa pelo nome do evento, o pedido
 * herdando o negócio do carrinho, o registro em Webhooks › Leads recebidos e a
 * recuperação pelo follow-up.
 *
 * Os campos vêm da documentação da API (resources/order e
 * resources/abandoned-checkout): `contact_name`, `contact_phone`,
 * `contact_email`, `products[].name`, `total`, `payment_status`, `status`,
 * `abandoned_checkout_url`. Peça pura: sem rede e sem banco.
 */
import type { EventoDaVenda } from "@/lib/webhooks/plataformas-de-venda";

type Objeto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Objeto =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function texto(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function primeiro(...valores: unknown[]): string | null {
  for (const v of valores) {
    const t = texto(v);
    if (t) return t;
  }
  return null;
}

/**
 * O nome do produto como as outras lojas gravam: o primeiro item, e "e mais N"
 * quando há outros. O carrinho e o pedido calculam igual — é o que faz a compra
 * herdar o negócio do carrinho (a chave é telefone + produto).
 */
export function produtoDaCompra(produtos: unknown): string | null {
  if (!Array.isArray(produtos)) return null;
  const nomes = produtos
    .map((p) => (ehObjeto(p) ? texto(p.name) : null))
    .filter((n): n is string => n !== null);
  if (nomes.length === 0) return null;
  return nomes.length === 1 ? nomes[0]! : `${nomes[0]} e mais ${nomes.length - 1}`;
}

/** Quem comprou: o contato do pedido primeiro, depois cliente, cobrança e entrega. */
function comprador(o: Objeto): { nome: string | null; telefone: string | null; email: string | null } {
  const cliente = ehObjeto(o.customer) ? o.customer : {};
  return {
    nome: primeiro(o.contact_name, cliente.name, o.billing_name, o.shipping_name),
    telefone: primeiro(o.contact_phone, cliente.phone, o.billing_phone, o.shipping_phone),
    email: primeiro(o.contact_email, cliente.email),
  };
}

/**
 * O evento pela situação do pedido. O vocabulário segue o das outras lojas
 * (`eventoPelaSituacao` em `lib/webhooks/lojas.ts`): cartão autorizado conta
 * como pago, pagamento anulado como expirado.
 *
 * Pedido cancelado com o pagamento ainda pendente é o Pix ou o boleto que
 * venceu. Cancelado DEPOIS de pago não é evento: o reembolso vem no aviso dele.
 */
export function eventoDoPedido(pedido: Objeto): EventoDaVenda | null {
  const pagamento = (texto(pedido.payment_status) ?? "").toLowerCase();
  const situacao = (texto(pedido.status) ?? "").toLowerCase();
  if (pagamento === "refunded") return "reembolso";
  if (pagamento === "paid" || pagamento === "authorized") return "compra_aprovada";
  if (pagamento === "voided" || pagamento === "abandoned") return "pagamento_expirado";
  if (situacao === "cancelled") {
    return pagamento === "pending" || pagamento === "" ? "pagamento_expirado" : null;
  }
  if (pagamento === "pending") return "aguardando_pagamento";
  return null;
}

export type AvisoDaNuvemshop = Record<string, string>;

function montar(
  evento: EventoDaVenda,
  o: Objeto,
  extra: { pedido?: string | null; link?: string | null },
): AvisoDaNuvemshop | null {
  const quem = comprador(o);
  // Sem telefone e sem e-mail não há com quem falar, nem como ligar o pedido ao carrinho.
  if (!quem.telefone && !quem.email) return null;
  const corpo: AvisoDaNuvemshop = { evento_da_venda: evento, plataforma: "nuvemshop" };
  if (quem.nome) corpo.nome = quem.nome;
  if (quem.telefone) corpo.telefone = quem.telefone;
  if (quem.email) corpo.email = quem.email;
  const produto = produtoDaCompra(o.products);
  if (produto) corpo.produto = produto;
  const valor = texto(o.total);
  if (valor) corpo.valor = valor;
  if (extra.link) corpo.link_checkout = extra.link;
  if (extra.pedido) corpo.id_do_pedido = extra.pedido;
  return corpo;
}

/** O pedido lido pela API → o aviso. `null` quando o pedido não diz nada que mova o negócio. */
export function avisoDoPedido(pedido: unknown): AvisoDaNuvemshop | null {
  if (!ehObjeto(pedido)) return null;
  const evento = eventoDoPedido(pedido);
  const id = texto(pedido.id);
  if (!evento || !id) return null;
  // O id interno (não o `number` que a loja mostra): é único na loja e não muda.
  return montar(evento, pedido, { pedido: `nuvemshop-${id}` });
}

/** O carrinho abandonado lido pela API → o aviso, com o link que retoma a compra. */
export function avisoDoCarrinho(carrinho: unknown): AvisoDaNuvemshop | null {
  if (!ehObjeto(carrinho)) return null;
  // Carrinho que virou pedido já foi avisado pelo pedido.
  if (texto(carrinho.completed_at)) return null;
  return montar("carrinho_abandonado", carrinho, {
    link: texto(carrinho.abandoned_checkout_url),
  });
}

/**
 * Os eventos de pedido que a Nuvemshop manda (`SUBSCRIBED_EVENTS` em
 * `config.ts`), como o webhook os grava no `event_log`.
 */
export const EVENTOS_DE_PEDIDO = [
  "nuvemshop.order_created",
  "nuvemshop.order_updated",
  "nuvemshop.order_paid",
  "nuvemshop.order_cancelled",
] as const;
