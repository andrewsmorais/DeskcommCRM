import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  avisoDaLojaAutentico,
  detectarLoja,
  ehPingDaWooCommerce,
  mapearAvisoDaLoja,
  type Cabecalhos,
} from "./lojas";
import { EVENTOS_DA_VENDA, mapearAvisoDeVenda } from "./plataformas-de-venda";

const cab = (h: Record<string, string> = {}): Cabecalhos => ({
  get: (n) => h[n.toLowerCase()] ?? null,
});

// Formas da documentação pública de cada loja (só os campos que lemos).
const shopifyCheckout = {
  id: 9001,
  token: "abc",
  email: "Maria@Exemplo.com",
  phone: "+5511987654321",
  completed_at: null,
  abandoned_checkout_url: "https://loja.myshopify.com/1/checkouts/abc/recover",
  total_price: "199.90",
  line_items: [{ title: "Tênis Azul" }],
  customer: { first_name: "Maria", last_name: "Silva" },
};
const shopifyPedido = (financial_status: string, extra: Record<string, unknown> = {}) => ({
  id: 5550001,
  name: "#1001",
  email: "maria@exemplo.com",
  financial_status,
  total_price: "199.90",
  order_status_url: "https://loja.myshopify.com/1/orders/x/authenticate",
  line_items: [{ title: "Tênis Azul" }],
  customer: { first_name: "Maria", last_name: "Silva", phone: null },
  billing_address: { phone: "(11) 98765-4321" },
  ...extra,
});

describe("lojas — Shopify", () => {
  it("checkout sem compra vira carrinho abandonado, com link de recuperação e valor", () => {
    const a = mapearAvisoDaLoja(shopifyCheckout, cab({ "x-shopify-topic": "checkouts/create" }))!;
    expect(a).toMatchObject({
      plataforma: "shopify",
      evento: "carrinho_abandonado",
      name: "Maria Silva",
      phone: "+5511987654321",
      email: "maria@exemplo.com",
      valorEmCentavos: 19990,
    });
    expect(a.custom_fields).toMatchObject({
      produto: "Tênis Azul",
      link_checkout: shopifyCheckout.abandoned_checkout_url,
      valor: "R$ 199,90",
    });
    expect(a.custom_fields.id_do_pedido).toBeUndefined();
  });

  it("checkout concluído não move nada", () => {
    const a = mapearAvisoDaLoja(
      { ...shopifyCheckout, completed_at: "2026-11-20T10:00:00Z" },
      cab({ "x-shopify-topic": "checkouts/update" }),
    )!;
    expect(a.evento).toBeNull();
  });

  it("pedido pendente (Pix ou boleto) é aguardando pagamento; pago é compra aprovada", () => {
    const pendente = mapearAvisoDaLoja(shopifyPedido("pending"), cab({ "x-shopify-topic": "orders/create" }))!;
    expect(pendente.evento).toBe("aguardando_pagamento");
    expect(pendente.phone).toBe("+5511987654321");
    expect(pendente.custom_fields.link_checkout).toContain("/orders/");
    expect(pendente.externalId).toBe("shopify:5550001");
    const pago = mapearAvisoDaLoja(shopifyPedido("paid"), cab({ "x-shopify-topic": "orders/paid" }))!;
    expect(pago.evento).toBe("compra_aprovada");
  });

  it("o pedido herda o negócio do carrinho da mesma pessoa e produto", () => {
    const carrinho = mapearAvisoDaLoja(shopifyCheckout, cab({ "x-shopify-topic": "checkouts/create" }))!;
    const pedido = mapearAvisoDaLoja(shopifyPedido("pending"), cab({ "x-shopify-topic": "orders/create" }))!;
    expect(pedido.chaveDoCarrinho).toBe(carrinho.externalId);
  });

  it("cancelado sem pagamento é pagamento expirado; reembolsado é reembolso", () => {
    expect(
      mapearAvisoDaLoja(
        shopifyPedido("voided", { cancelled_at: "2026-11-20" }),
        cab({ "x-shopify-topic": "orders/cancelled" }),
      )!.evento,
    ).toBe("pagamento_expirado");
    expect(
      mapearAvisoDaLoja(shopifyPedido("refunded"), cab({ "x-shopify-topic": "orders/updated" }))!.evento,
    ).toBe("reembolso");
  });
});

describe("lojas — WooCommerce", () => {
  const pedido = (status: string) => ({
    id: 321,
    status,
    total: "89.90",
    payment_url: "https://minhaloja.com/checkout/order-pay/321/?key=wc_order_x",
    billing: { first_name: "João", last_name: "Souza", phone: "21 99876-5432", email: "joao@ex.com" },
    line_items: [{ name: "Camiseta" }, { name: "Boné" }],
  });
  const woo = cab({ "x-wc-webhook-topic": "order.updated" });

  it("situações viram eventos", () => {
    expect(mapearAvisoDaLoja(pedido("on-hold"), woo)!.evento).toBe("aguardando_pagamento");
    expect(mapearAvisoDaLoja(pedido("pending"), woo)!.evento).toBe("aguardando_pagamento");
    expect(mapearAvisoDaLoja(pedido("processing"), woo)!.evento).toBe("compra_aprovada");
    expect(mapearAvisoDaLoja(pedido("failed"), woo)!.evento).toBe("compra_recusada");
    expect(mapearAvisoDaLoja(pedido("cancelled"), woo)!.evento).toBe("pagamento_expirado");
    expect(mapearAvisoDaLoja(pedido("refunded"), woo)!.evento).toBe("reembolso");
    expect(mapearAvisoDaLoja(pedido("checkout-draft"), woo)!.evento).toBeNull();
  });

  it("lê o comprador do billing, o link de pagamento e os itens", () => {
    expect(mapearAvisoDaLoja(pedido("on-hold"), woo)).toMatchObject({
      plataforma: "woocommerce",
      name: "João Souza",
      phone: "+5521998765432",
      email: "joao@ex.com",
      externalId: "woocommerce:321",
      custom_fields: { produto: "Camiseta e mais 1", link_checkout: expect.stringContaining("order-pay") },
    });
  });

  it("o ping de quando o webhook é salvo é reconhecido", () => {
    expect(ehPingDaWooCommerce({ webhook_id: "12" })).toBe(true);
    expect(ehPingDaWooCommerce({ webhook_id: "12", id: 1 })).toBe(false);
  });
});

describe("lojas — Yampi", () => {
  const recurso = {
    id: 77,
    number: 1234,
    value_total: 149.9,
    status: { data: { alias: "waiting_payment" } },
    checkout_url: "https://seguro.loja.com/checkout/abc",
    customer: {
      data: { name: "Ana Lima", email: "ana@ex.com", phone: { full_number: "11912345678" } },
    },
    items: { data: [{ sku: { data: { title: "Kit Skincare" } } }] },
  };

  it("pedido criado, pago e recusado", () => {
    const criado = mapearAvisoDaLoja({ event: "order.created", resource: recurso }, cab())!;
    expect(criado).toMatchObject({
      plataforma: "yampi",
      evento: "aguardando_pagamento",
      name: "Ana Lima",
      phone: "+5511912345678",
      valorEmCentavos: 14990,
      externalId: "yampi:77",
      custom_fields: { produto: "Kit Skincare" },
    });
    expect(mapearAvisoDaLoja({ event: "order.paid", resource: recurso }, cab())!.evento).toBe(
      "compra_aprovada",
    );
    expect(
      mapearAvisoDaLoja({ event: "transaction.payment.refused", resource: recurso }, cab())!.evento,
    ).toBe("compra_recusada");
  });

  it("carrinho abandonado usa o link de retomada", () => {
    const a = mapearAvisoDaLoja(
      {
        event: "cart.reminder",
        resource: {
          customer: { data: { name: "Ana", phone: { full_number: "11912345678" } } },
          totalizers: { total: 59.9 },
          simulate_url: "https://seguro.loja.com/cart/retomar",
          items: { data: [{ sku: { data: { title: "Sérum" } } }] },
        },
      },
      cab(),
    )!;
    expect(a.evento).toBe("carrinho_abandonado");
    expect(a.custom_fields.link_checkout).toBe("https://seguro.loja.com/cart/retomar");
    expect(a.valorEmCentavos).toBe(5990);
  });

  it("não é confundida com a Cakto (que manda `data`, não `resource`)", () => {
    expect(detectarLoja({ event: "order.paid", data: {} }, cab())).toBeNull();
  });
});

describe("lojas — CartPanda e formato ChatAI", () => {
  it("CartPanda: identificada pelo endereço, pedido dentro de `order`", () => {
    const a = mapearAvisoDaLoja(
      {
        event: "order.paid",
        order: {
          id: 88,
          total_price: "97.00",
          customer: { first_name: "Bia", last_name: "Rocha", phone: "11955554444", email: "b@ex.com" },
          line_items: [{ title: "Curso" }],
        },
      },
      cab(),
      "cartpanda",
    )!;
    expect(a).toMatchObject({ plataforma: "cartpanda", evento: "compra_aprovada", name: "Bia Rocha" });
  });

  it("CartPanda: carrinho abandonado", () => {
    const a = mapearAvisoDaLoja(
      {
        event: "abandoned.cart",
        checkout: { phone: "11955554444", checkout_url: "https://pay.loja.com/c/1", line_items: [{ title: "Curso" }] },
      },
      cab(),
      "cartpanda",
    )!;
    expect(a.evento).toBe("carrinho_abandonado");
    expect(a.custom_fields.link_checkout).toBe("https://pay.loja.com/c/1");
  });

  it("formato ChatAI (Wix pelas Automações, Make, Zapier)", () => {
    const a = mapearAvisoDaLoja(
      {
        evento_da_venda: "carrinho_abandonado",
        plataforma: "Wix",
        nome: "Carla",
        telefone: "(31) 98888-7777",
        produto: "Vestido",
        valor: "R$ 249,90",
        link_checkout: "https://minhaloja.wixsite.com/checkout",
      },
      cab(),
    )!;
    expect(a).toMatchObject({
      plataforma: "loja",
      evento: "carrinho_abandonado",
      phone: "+5531988887777",
      valorEmCentavos: 24990,
      custom_fields: { plataforma: "Wix", produto: "Vestido" },
    });
  });

  it("aviso que não é de loja segue para o adaptador de plataformas de venda", () => {
    const kiwify = {
      webhook_event_type: "order_approved",
      order_id: "k1",
      Customer: { full_name: "Ze", mobile: "11999998888" },
    };
    expect(mapearAvisoDaLoja(kiwify, cab())).toBeNull();
    expect(mapearAvisoDeVenda(kiwify)?.plataforma).toBe("kiwify");
  });
});

describe("lojas — assinatura", () => {
  const corpo = JSON.stringify(shopifyCheckout);
  const sig = (s: string) => createHmac("sha256", s).update(corpo, "utf8").digest("base64");

  it.each(["x-shopify-hmac-sha256", "x-wc-webhook-signature", "x-yampi-hmac-sha256"])(
    "%s: HMAC-SHA256 em base64 com o segredo da fonte",
    (h) => {
      expect(avisoDaLojaAutentico(corpo, cab({ [h]: sig("segredo") }), "segredo")).toBe(true);
      expect(avisoDaLojaAutentico(corpo, cab({ [h]: sig("outro") }), "segredo")).toBe(false);
    },
  );

  it("sem cabeçalho, não se prova (CartPanda é protegida pelo endereço secreto)", () => {
    expect(avisoDaLojaAutentico(corpo, cab(), "segredo")).toBe(false);
  });
});

describe("formato ChatAI aceita todo nome canônico de evento", () => {
  it.each(EVENTOS_DA_VENDA)("%s", (evento) => {
    const aviso = mapearAvisoDaLoja(
      { evento_da_venda: evento, telefone: "11987654321", produto: "Curso" },
      { get: () => null },
    );
    expect(aviso?.evento).toBe(evento);
  });
});
