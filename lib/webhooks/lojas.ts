/**
 * Avisos das LOJAS (Shopify, WooCommerce, Yampi, CartPanda) e do formato ChatAI
 * na rota pública de captação (`/api/v1/webhooks/in/[token]`) — PURO, sem I/O.
 *
 * Irmão de `plataformas-de-venda.ts` (Kiwify, Cakto, Hotmart), e devolve a MESMA
 * forma (`AvisoDeVenda`): o comprador, o EVENTO normalizado e a chave do pedido.
 * Daqui para frente o caminho é o mesmo: o aviso vira contato + negócio na
 * etapa com o nome do evento ("Carrinho abandonado", "Aguardando pagamento",
 * "Pago"), e o follow-up ou a automação daquela etapa faz a recuperação.
 *
 * Por que era preciso: toda loja manda o cliente ANINHADO no pedido
 * (`customer.phone`, `billing.phone`, `resource.customer.data.phone`), e o
 * mapeador genérico só lê chave de topo — o aviso caía em "nenhum campo
 * mapeável" e nenhum lead entrava. É o mesmo defeito que o RD Station tinha.
 *
 * Como cada loja se identifica:
 *   - Shopify: cabeçalho `X-Shopify-Topic` (checkouts/create, orders/paid…);
 *   - WooCommerce: cabeçalho `X-WC-Webhook-Topic` (order.created, order.updated);
 *   - Yampi: envelope `{ event: "order.paid", resource: {…} }`;
 *   - CartPanda: o endereço leva `?plataforma=cartpanda` (o aviso não traz
 *     assinatura nem cabeçalho próprio, e a documentação pública não está
 *     acessível — os caminhos de campo aqui são tolerantes e o PRIMEIRO aviso
 *     real deve ser conferido na tela de Capturas);
 *   - formato ChatAI: `evento_da_venda` no topo, com os nossos nomes de campo.
 *
 * Os nomes de campo vêm da documentação pública de cada loja; o que não for
 * achado fica de fora, nunca inventado.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizePhoneBR } from "./inbound";
import {
  chave,
  emReais,
  eventoDaVenda,
  type AvisoDeVenda,
  type EventoDaVenda,
  type PlataformaDeVenda,
} from "./plataformas-de-venda";

export type Loja = Extract<
  PlataformaDeVenda,
  "shopify" | "woocommerce" | "yampi" | "cartpanda" | "loja"
>;

/** O pedaço de `Headers` que esta peça usa (testável sem Request). */
export interface Cabecalhos {
  get(nome: string): string | null;
}

type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Valor num caminho "a.b.0.c" (número = posição na lista). */
function no(raiz: unknown, caminho: string): unknown {
  let atual: unknown = raiz;
  for (const parte of caminho.split(".")) {
    if (Array.isArray(atual) && /^\d+$/.test(parte)) atual = atual[Number(parte)];
    else atual = ehObjeto(atual) ? atual[parte] : undefined;
  }
  return atual;
}

/** O primeiro texto ou número não vazio entre os caminhos. */
function texto(raiz: unknown, caminhos: string[]): string | null {
  for (const c of caminhos) {
    const v = no(raiz, c);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** "Maria" + "Silva", ou o nome inteiro, o que vier primeiro. */
function nomeDe(raiz: unknown, pares: [string, string][], inteiros: string[]): string | null {
  for (const [a, b] of pares) {
    const n = [texto(raiz, [a]), texto(raiz, [b])].filter(Boolean).join(" ");
    if (n) return n;
  }
  return texto(raiz, inteiros);
}

/** O primeiro item do pedido, com "e mais N" quando há outros — igual no carrinho e no pedido. */
function produtoDe(raiz: unknown, lista: string, campos: string[]): string | null {
  const itens = no(raiz, lista);
  if (!Array.isArray(itens) || itens.length === 0) return null;
  const primeiroItem = texto(itens[0], campos);
  if (!primeiroItem) return null;
  return itens.length > 1 ? `${primeiroItem} e mais ${itens.length - 1}` : primeiroItem;
}

/** "199.90", 199.9 ou "R$ 199,90" → centavos; null quando não é número. */
function centavos(bruto: string | null): number | null {
  if (bruto === null) return null;
  let t = bruto.replace(/[^\d.,-]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return t && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Evento pela situação do pagamento — o vocabulário é parecido entre as lojas. */
function eventoPelaSituacao(situacao: string | null): EventoDaVenda | null {
  if (!situacao) return null;
  const s = situacao.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["pending", "on_hold", "waiting_payment", "awaiting_payment", "unpaid"].includes(s))
    return "aguardando_pagamento";
  if (["paid", "processing", "completed", "authorized", "approved", "partially_paid"].includes(s))
    return "compra_aprovada";
  if (["failed", "refused", "declined", "denied"].includes(s)) return "compra_recusada";
  if (["refunded", "partially_refunded"].includes(s)) return "reembolso";
  if (["chargeback", "chargedback", "disputed"].includes(s)) return "chargeback";
  if (["cancelled", "canceled", "voided", "expired"].includes(s)) return "pagamento_expirado";
  return eventoDaVenda(s);
}

export function detectarLoja(
  payload: Objeto,
  cab: Cabecalhos,
  plataformaNaUrl: string | null = null,
): Loja | null {
  if (cab.get("x-shopify-topic")) return "shopify";
  if (cab.get("x-wc-webhook-topic")) return "woocommerce";
  if (plataformaNaUrl?.trim().toLowerCase() === "cartpanda") return "cartpanda";
  if (
    typeof payload.event === "string" &&
    /^(order|cart|transaction)\./.test(payload.event) &&
    ehObjeto(payload.resource)
  )
    return "yampi";
  if (typeof payload.evento_da_venda === "string" && eventoDaVenda(payload.evento_da_venda))
    return "loja";
  return null;
}

/** O ping que a WooCommerce manda ao salvar o webhook: `webhook_id=123`, sem pedido. */
export function ehPingDaWooCommerce(payload: Objeto): boolean {
  const chaves = Object.keys(payload);
  return chaves.length === 1 && chaves[0] === "webhook_id";
}

type Lido = {
  evento: EventoDaVenda | null;
  /** Onde o comprador e o pedido moram dentro do aviso. */
  raiz: unknown;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  produto: string | null;
  valor: string | null;
  link: string | null;
  pedido: string | null;
};

function lerShopify(p: Objeto, topico: string): Lido {
  const ehCheckout = topico.startsWith("checkouts/");
  let evento: EventoDaVenda | null;
  if (ehCheckout) {
    // O checkout chega assim que a pessoa digita o contato — ANTES de desistir.
    // Quem espera é o follow-up da etapa (que se cancela quando o pedido entra).
    evento = p.completed_at ? null : "carrinho_abandonado";
  } else if (topico === "orders/cancelled" || p.cancelled_at) {
    evento = p.financial_status === "refunded" ? "reembolso" : "pagamento_expirado";
  } else {
    evento = eventoPelaSituacao(typeof p.financial_status === "string" ? p.financial_status : null);
  }
  return {
    evento,
    raiz: p,
    nome: nomeDe(
      p,
      [
        ["customer.first_name", "customer.last_name"],
        ["billing_address.first_name", "billing_address.last_name"],
        ["shipping_address.first_name", "shipping_address.last_name"],
      ],
      ["billing_address.name", "shipping_address.name"],
    ),
    telefone: texto(p, [
      "phone",
      "customer.phone",
      "billing_address.phone",
      "shipping_address.phone",
      "customer.default_address.phone",
    ]),
    email: texto(p, ["email", "contact_email", "customer.email"]),
    produto: produtoDe(p, "line_items", ["title", "name"]),
    valor: texto(p, ["total_price", "current_total_price", "subtotal_price"]),
    link: texto(p, ehCheckout ? ["abandoned_checkout_url"] : ["order_status_url"]),
    pedido: ehCheckout ? null : texto(p, ["id", "order_number", "name"]),
  };
}

function lerWooCommerce(p: Objeto): Lido {
  const situacao = typeof p.status === "string" ? p.status : null;
  return {
    // `checkout-draft` é o rascunho do checkout em blocos: ainda não é pedido.
    evento: situacao === "checkout-draft" ? null : eventoPelaSituacao(situacao),
    raiz: p,
    nome: nomeDe(
      p,
      [
        ["billing.first_name", "billing.last_name"],
        ["shipping.first_name", "shipping.last_name"],
      ],
      [],
    ),
    telefone: texto(p, ["billing.phone", "shipping.phone"]),
    email: texto(p, ["billing.email"]),
    produto: produtoDe(p, "line_items", ["name"]),
    valor: texto(p, ["total"]),
    link: texto(p, ["payment_url"]),
    pedido: texto(p, ["id", "number"]),
  };
}

function lerYampi(p: Objeto): Lido {
  const r = p.resource as Objeto;
  const ev = String(p.event);
  const alias = texto(r, ["status.data.alias", "status.alias", "status"]);
  const evento: EventoDaVenda | null =
    ev === "cart.reminder"
      ? "carrinho_abandonado"
      : ev === "order.paid"
        ? "compra_aprovada"
        : ev === "transaction.payment.refused"
          ? "compra_recusada"
          : ev === "order.created"
            ? (eventoPelaSituacao(alias) ?? "aguardando_pagamento")
            : ev.startsWith("order.")
              ? eventoPelaSituacao(alias)
              : null;
  const ehCarrinho = ev === "cart.reminder";
  return {
    evento,
    raiz: r,
    nome: nomeDe(
      r,
      [["customer.data.first_name", "customer.data.last_name"]],
      ["customer.data.name", "customer.name"],
    ),
    telefone: texto(r, [
      "customer.data.phone.full_number",
      "customer.data.phone.formated_number",
      "customer.data.phone",
      "customer.phone.full_number",
      "customer.phone",
    ]),
    email: texto(r, ["customer.data.email", "customer.email"]),
    produto:
      produtoDe(r, "items.data", ["sku.data.title", "name", "title"]) ??
      produtoDe(r, "items", ["sku.data.title", "name", "title"]),
    valor: texto(r, ["value_total", "buyer_value_total", "totalizers.total", "total"]),
    link: texto(
      r,
      ehCarrinho
        ? ["simulate_url", "unauth_simulate_url", "checkout_url", "spreadsheet.data.purchase_url"]
        : ["checkout_url", "public_url"],
    ),
    pedido: ehCarrinho ? null : texto(r, ["id", "number"]),
  };
}

function lerCartPanda(p: Objeto): Lido {
  // Tolerante de propósito: o pedido pode vir no topo ou dentro de
  // `order`/`checkout`/`cart`/`data`. Ver o cabeçalho deste arquivo.
  const raiz =
    [p.order, p.checkout, p.cart, p.abandoned_cart, p.data].find(ehObjeto) ?? p;
  const ev = texto(p, ["event", "topic", "type"])?.toLowerCase() ?? "";
  const ehCarrinho = /abandon|cart|checkout/.test(ev) && !/order/.test(ev);
  const evento: EventoDaVenda | null = ehCarrinho
    ? "carrinho_abandonado"
    : /paid|approved/.test(ev)
      ? "compra_aprovada"
      : /refund/.test(ev)
        ? "reembolso"
        : /chargeback/.test(ev)
          ? "chargeback"
          : eventoPelaSituacao(
              texto(raiz, ["financial_status", "payment_status", "status"]),
            ) ?? (/created/.test(ev) ? "aguardando_pagamento" : null);
  return {
    evento,
    raiz,
    nome: nomeDe(
      raiz,
      [
        ["customer.first_name", "customer.last_name"],
        ["billing_address.first_name", "billing_address.last_name"],
        ["shipping_address.first_name", "shipping_address.last_name"],
      ],
      ["customer.name", "customer.full_name", "name"],
    ),
    telefone: texto(raiz, [
      "customer.phone",
      "phone",
      "billing_address.phone",
      "shipping_address.phone",
      "customer.cellphone",
    ]),
    email: texto(raiz, ["customer.email", "email", "contact_email"]),
    produto:
      produtoDe(raiz, "line_items", ["title", "name", "product_name"]) ??
      produtoDe(raiz, "items", ["title", "name", "product_name"]),
    valor: texto(raiz, ["total_price", "total", "amount"]),
    link: texto(raiz, [
      "abandoned_checkout_url",
      "checkout_url",
      "checkout_link",
      "payment_url",
      "order_status_url",
    ]),
    pedido: ehCarrinho ? null : texto(raiz, ["id", "order_id", "number"]),
  };
}

function lerFormatoChatAI(p: Objeto): Lido {
  return {
    evento: eventoDaVenda(p.evento_da_venda),
    raiz: p,
    nome: texto(p, ["nome", "name"]),
    telefone: texto(p, ["telefone", "whatsapp", "celular", "phone"]),
    email: texto(p, ["email", "e-mail"]),
    produto: texto(p, ["produto", "product"]),
    valor: texto(p, ["valor", "total"]),
    link: texto(p, ["link_checkout", "link", "checkout_url"]),
    pedido: texto(p, ["id_do_pedido", "pedido", "order_id"]),
  };
}

export function mapearAvisoDaLoja(
  payload: Objeto,
  cab: Cabecalhos,
  plataformaNaUrl: string | null = null,
): AvisoDeVenda | null {
  const loja = detectarLoja(payload, cab, plataformaNaUrl);
  if (!loja) return null;
  const lido =
    loja === "shopify"
      ? lerShopify(payload, (cab.get("x-shopify-topic") ?? "").trim().toLowerCase())
      : loja === "woocommerce"
        ? lerWooCommerce(payload)
        : loja === "yampi"
          ? lerYampi(payload)
          : loja === "cartpanda"
            ? lerCartPanda(payload)
            : lerFormatoChatAI(payload);

  const telefone = normalizePhoneBR(lido.telefone);
  const email = lido.email ? lido.email.toLowerCase() : null;
  const valor = centavos(lido.valor);
  const { evento, produto, link } = lido;
  const plataforma: PlataformaDeVenda = loja;
  // No formato ChatAI, quem manda pode dizer o nome da loja ("wix", "minha loja").
  const nomeDaLoja =
    loja === "loja" && typeof payload.plataforma === "string" && payload.plataforma.trim()
      ? payload.plataforma.trim().slice(0, 40)
      : loja;

  const custom_fields: Record<string, string> = { plataforma: nomeDaLoja };
  if (evento) custom_fields.evento_da_venda = evento;
  if (produto) custom_fields.produto = produto.slice(0, 200);
  if (link) custom_fields.link_checkout = link.slice(0, 500);
  if (lido.pedido && evento !== "carrinho_abandonado")
    custom_fields.id_do_pedido = lido.pedido.slice(0, 120);
  if (valor !== null) custom_fields.valor = emReais(valor);

  // A mesma chave no carrinho e no pedido: a compra herda o negócio do carrinho.
  const chaveDoCarrinho =
    telefone || email ? `${plataforma}:carrinho:${chave(telefone ?? email, produto)}` : null;
  const externalId =
    evento === "carrinho_abandonado"
      ? chaveDoCarrinho
      : lido.pedido
        ? `${plataforma}:${lido.pedido}`.slice(0, 255)
        : chaveDoCarrinho;

  return {
    name: lido.nome,
    phone: telefone,
    email,
    custom_fields,
    source_metadata: {},
    plataforma,
    evento,
    externalId,
    chaveDoCarrinho: evento === "carrinho_abandonado" ? null : chaveDoCarrinho,
    valorEmCentavos: valor,
  };
}

/**
 * Shopify, WooCommerce e Yampi assinam o aviso do mesmo jeito: HMAC-SHA256 do
 * corpo cru, em base64, num cabeçalho próprio de cada uma. O segredo é o que a
 * loja mostra ao criar o webhook, cadastrado como segredo da fonte de captação.
 * CartPanda não assina: quem protege é o endereço secreto.
 */
export function avisoDaLojaAutentico(rawBody: string, cab: Cabecalhos, segredo: string): boolean {
  const recebida =
    cab.get("x-shopify-hmac-sha256") ??
    cab.get("x-wc-webhook-signature") ??
    cab.get("x-yampi-hmac-sha256");
  if (!recebida || !segredo) return false;
  const esperada = createHmac("sha256", segredo).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
