/**
 * Avisos das plataformas de venda (Kiwify, Cakto) na rota pública de captação
 * (`/api/v1/webhooks/in/[token]`) — PURO, sem I/O.
 *
 * As duas mandam o comprador ANINHADO (`Customer.mobile`, `data.customer.phone`
 * ou `data.customerCellphone`), que o mapeador genérico descarta por desenho
 * (ele só lê chave de topo). Este adaptador entra antes dele, no mesmo molde
 * de `respondi.ts` e `rdstation.ts`, e devolve:
 *   - o comprador (nome, telefone E.164, e-mail);
 *   - o EVENTO normalizado (`compra_aprovada`, `carrinho_abandonado`...), que
 *     escolhe a etapa do negócio por nome (`etapaDoEvento`);
 *   - a chave do PEDIDO (`kiwify:<order_id>`), que faz o mesmo pedido ser UM
 *     negócio que anda de etapa — decisão do dono do produto, 23/10/2026;
 *   - campos do negócio que viram variáveis do chatbot: `produto`,
 *     `link_checkout`, `valor`, `evento_da_venda`, `plataforma`, `id_do_pedido`.
 *
 * Os nomes de campo vêm da documentação pública de cada plataforma e das
 * variações que elas usam entre eventos; o que não for achado fica de fora,
 * nunca inventado.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizePhoneBR, type MappedLead } from "./inbound";

/** Minúsculas, sem acento, espaços colapsados (nome de etapa e chave de carrinho). */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type PlataformaDeVenda = "kiwify" | "cakto";

export const EVENTOS_DA_VENDA = [
  "carrinho_abandonado",
  "aguardando_pagamento",
  "compra_aprovada",
  "compra_recusada",
  "reembolso",
  "chargeback",
  "assinatura_cancelada",
  "assinatura_atrasada",
  "assinatura_renovada",
] as const;
export type EventoDaVenda = (typeof EVENTOS_DA_VENDA)[number];

/** Como cada plataforma chama cada evento (nome do gatilho ou status do pedido). */
const SINONIMOS: Record<EventoDaVenda, string[]> = {
  carrinho_abandonado: ["carrinho_abandonado", "abandoned_cart", "abandoned", "checkout_abandonment", "abandonment"],
  aguardando_pagamento: [
    "boleto_gerado",
    "pix_gerado",
    "picpay_gerado",
    "billet_created",
    "pix_created",
    "waiting_payment",
    "pending",
  ],
  compra_aprovada: ["compra_aprovada", "order_approved", "purchase_approved", "paid", "approved"],
  compra_recusada: ["compra_recusada", "order_rejected", "purchase_refused", "refused", "rejected"],
  reembolso: ["compra_reembolsada", "order_refunded", "refund", "refunded"],
  chargeback: ["chargeback", "chargedback"],
  assinatura_cancelada: ["subscription_canceled", "subscription_cancelled"],
  assinatura_atrasada: ["subscription_late"],
  assinatura_renovada: ["subscription_renewed"],
};

export function eventoDaVenda(bruto: unknown): EventoDaVenda | null {
  if (typeof bruto !== "string") return null;
  const v = bruto.trim().toLowerCase();
  for (const evento of EVENTOS_DA_VENDA) if (SINONIMOS[evento].includes(v)) return evento;
  return null;
}

/**
 * Nomes de etapa (já normalizados: minúscula, sem acento) que recebem cada
 * evento. O dono do funil só precisa ter uma etapa com um destes nomes.
 */
export const ETAPAS_DO_EVENTO: Record<EventoDaVenda, string[]> = {
  carrinho_abandonado: ["carrinho abandonado", "abandonou o carrinho", "abandono de carrinho", "carrinho"],
  aguardando_pagamento: ["aguardando pagamento", "pix gerado", "boleto gerado", "pagamento pendente", "aguardando"],
  compra_aprovada: ["pago", "compra aprovada", "venda aprovada", "aprovado", "pagamento aprovado", "cliente"],
  compra_recusada: ["compra recusada", "pagamento recusado", "recusado"],
  reembolso: ["reembolsado", "reembolso", "estornado"],
  chargeback: ["chargeback", "contestado"],
  assinatura_cancelada: ["assinatura cancelada", "cancelado"],
  assinatura_atrasada: ["assinatura atrasada", "atrasado", "inadimplente"],
  assinatura_renovada: ["assinatura renovada", "renovado"],
};

/** A etapa do funil que recebe o evento, pelo nome; null = fica onde está (ou na etapa padrão). */
export function etapaDoEvento(
  evento: EventoDaVenda | null,
  etapas: { id: string; name: string }[],
): string | null {
  if (!evento) return null;
  const nomes = ETAPAS_DO_EVENTO[evento];
  for (const nome of nomes) {
    const achada = etapas.find((e) => normalizar(e.name) === nome);
    if (achada) return achada.id;
  }
  return null;
}

type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

/** O primeiro valor simples (texto ou número) entre os caminhos. */
function primeiro(raiz: unknown, caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let atual: unknown = raiz;
    for (const parte of caminho.split(".")) atual = ehObjeto(atual) ? atual[parte] : undefined;
    if (typeof atual === "string" && atual.trim()) return atual.trim();
    if (typeof atual === "number" && Number.isFinite(atual)) return String(atual);
  }
  return null;
}

export function detectarPlataforma(payload: Objeto): PlataformaDeVenda | null {
  // Cakto: envelope { secret?, event, data: {...} }.
  if (typeof payload.event === "string" && ehObjeto(payload.data) && eventoDaVenda(payload.event)) return "cakto";
  // Kiwify: pedido com status/gatilho e o comprador em `Customer`; ou o
  // carrinho abandonado, que vem plano, com o link do checkout.
  if (
    (typeof payload.webhook_event_type === "string" || typeof payload.order_status === "string") &&
    ehObjeto(payload.Customer)
  )
    return "kiwify";
  if (typeof payload.checkout_link === "string" && (payload.status === "abandoned" || payload.product_name))
    return "kiwify";
  return null;
}

export type AvisoDeVenda = MappedLead & {
  plataforma: PlataformaDeVenda;
  evento: EventoDaVenda | null;
  /** `plataforma:pedido` — o mesmo pedido é sempre o mesmo negócio. */
  externalId: string | null;
  /** O carrinho abandonado da mesma pessoa e produto, para a compra herdar o negócio dele. */
  chaveDoCarrinho: string | null;
  /** Valor em centavos, quando a plataforma manda o preço em reais. */
  valorEmCentavos: number | null;
};

/** "R$ 1.297,90" com espaço comum — o Intl põe um espaço inseparável que vira lixo em alguns WhatsApp. */
function emReais(centavos: number): string {
  const [inteiro = "0", fracao = "00"] = (centavos / 100).toFixed(2).split(".");
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fracao}`;
}

function chave(...partes: (string | null)[]): string {
  return partes.map((p) => normalizar(p ?? "").replace(/\s+/g, "-")).join(":").slice(0, 255);
}

export function mapearAvisoDeVenda(payload: Objeto): AvisoDeVenda | null {
  const plataforma = detectarPlataforma(payload);
  if (!plataforma) return null;

  const d: Objeto = plataforma === "cakto" && ehObjeto(payload.data) ? payload.data : payload;
  const evento =
    plataforma === "cakto"
      ? eventoDaVenda(payload.event)
      : (eventoDaVenda(payload.webhook_event_type) ??
        eventoDaVenda(payload.order_status) ??
        (typeof payload.checkout_link === "string" && !payload.order_id ? "carrinho_abandonado" : null));

  const nome = primeiro(d, ["Customer.full_name", "Customer.first_name", "customer.name", "customerName", "name"]);
  const telefoneBruto = primeiro(d, [
    "Customer.mobile",
    "Customer.phone",
    "customer.phone",
    "customer.cellphone",
    "customerCellphone",
    "phone",
    "mobile",
  ]);
  const email = primeiro(d, ["Customer.email", "customer.email", "customerEmail", "email"]);
  const produto = primeiro(d, ["Product.product_name", "product.name", "product_name", "offer.name"]);
  const pedido = primeiro(d, ["order_id", "id", "refId", "order.id"]);
  const link = primeiro(d, ["checkout_link", "checkoutUrl", "checkout_url", "paymentUrl"]);
  // Cakto manda o preço em reais (`offer.price: 97.9`, `amount`). Kiwify manda
  // valores em centavos em campos que mudam entre eventos — não adivinhamos.
  const reais = plataforma === "cakto" ? primeiro(d, ["amount", "offer.price", "baseAmount"]) : null;
  const valor = reais !== null && Number.isFinite(Number(reais)) ? Math.round(Number(reais) * 100) : null;
  const telefone = normalizePhoneBR(telefoneBruto);

  const custom_fields: Record<string, string> = { plataforma };
  if (evento) custom_fields.evento_da_venda = evento;
  if (produto) custom_fields.produto = produto.slice(0, 200);
  if (link) custom_fields.link_checkout = link.slice(0, 500);
  if (pedido && evento !== "carrinho_abandonado") custom_fields.id_do_pedido = pedido.slice(0, 120);
  if (valor !== null)
    custom_fields.valor = emReais(valor);

  const chaveDoCarrinho = telefone || email ? `${plataforma}:carrinho:${chave(telefone ?? email, produto)}` : null;
  const externalId =
    evento === "carrinho_abandonado"
      ? chaveDoCarrinho
      : pedido
        ? `${plataforma}:${pedido}`.slice(0, 255)
        : null;

  return {
    name: nome,
    phone: telefone,
    email: email ? email.toLowerCase() : null,
    custom_fields,
    source_metadata: {},
    plataforma,
    evento,
    externalId,
    chaveDoCarrinho: evento === "carrinho_abandonado" ? null : chaveDoCarrinho,
    valorEmCentavos: valor,
  };
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * A plataforma não manda o `X-ChatAI-Signature` da rota, então cada uma se
 * prova do jeito dela, com o segredo da fonte de captação:
 *   - Cakto: o campo `secret` do corpo é o segredo do webhook;
 *   - Kiwify: o parâmetro `?signature=` da URL é o HMAC-SHA1 do corpo cru com
 *     o token do webhook.
 */
export function avisoDaPlataformaAutentico(
  rawBody: string,
  payload: Record<string, unknown>,
  assinaturaNaUrl: string | null,
  segredo: string,
): boolean {
  const plataforma = detectarPlataforma(payload);
  if (plataforma === "cakto") return typeof payload.secret === "string" && iguais(payload.secret, segredo);
  if (plataforma === "kiwify" && assinaturaNaUrl) {
    const esperado = createHmac("sha1", segredo).update(rawBody).digest("hex");
    return iguais(esperado, assinaturaNaUrl.trim().toLowerCase());
  }
  return false;
}
