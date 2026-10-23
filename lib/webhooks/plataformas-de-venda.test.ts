import { describe, expect, it } from "vitest";

import { detectarPlataforma, etapaDoEvento, eventoDaVenda, mapearAvisoDeVenda } from "./plataformas-de-venda";

/** Forma da Kiwify: pedido com `Customer`/`Product` e o gatilho em `webhook_event_type`. */
const kiwifyAprovada = {
  order_id: "a1b2c3",
  order_status: "paid",
  webhook_event_type: "order_approved",
  checkout_link: "https://pay.kiwify.com.br/abc",
  Product: { product_id: "p1", product_name: "Curso de Bolos" },
  Customer: { full_name: "Ana Souza", email: "Ana@Exemplo.com", mobile: "(11) 98888-7777" },
};

/** Forma da Cakto: envelope { secret, event, data }, comprador plano dentro de `data`. */
const caktoAbandono = {
  secret: "123",
  event: "checkout_abandonment",
  data: {
    offer: { id: "B8BcHrY", name: "Oferta", price: 97.9 },
    product: { name: "Mentoria", id: "cd287b31" },
    customerName: "Bruno Lima",
    customerEmail: "bruno@exemplo.com",
    customerCellphone: "34999999999",
    checkoutUrl: "https://pay.cakto.com.br/B8BcHrY",
  },
};

describe("detectar a plataforma", () => {
  it("reconhece Kiwify e Cakto, e deixa formulário comum para o mapeador genérico", () => {
    expect(detectarPlataforma(kiwifyAprovada)).toBe("kiwify");
    expect(detectarPlataforma(caktoAbandono)).toBe("cakto");
    expect(detectarPlataforma({ name: "x", phone: "11999999999" })).toBeNull();
    // Loja qualquer com order_status mas sem o comprador da Kiwify não vira "kiwify".
    expect(detectarPlataforma({ order_id: "1", order_status: "paid" })).toBeNull();
  });
});

describe("Kiwify", () => {
  it("compra aprovada: comprador aninhado, chave do pedido e campos para o chatbot", () => {
    expect(mapearAvisoDeVenda(kiwifyAprovada)).toMatchObject({
      plataforma: "kiwify",
      evento: "compra_aprovada",
      name: "Ana Souza",
      phone: "+5511988887777",
      email: "ana@exemplo.com",
      externalId: "kiwify:a1b2c3",
      custom_fields: {
        plataforma: "kiwify",
        evento_da_venda: "compra_aprovada",
        produto: "Curso de Bolos",
        link_checkout: "https://pay.kiwify.com.br/abc",
        id_do_pedido: "a1b2c3",
      },
      valorEmCentavos: null,
    });
  });

  it("Pix gerado e o carrinho abandonado (que vem plano, sem pedido)", () => {
    expect(mapearAvisoDeVenda({ ...kiwifyAprovada, webhook_event_type: "pix_created", order_status: "waiting_payment" })?.evento).toBe(
      "aguardando_pagamento",
    );
    const carrinho = mapearAvisoDeVenda({
      checkout_link: "https://pay.kiwify.com.br/xyz",
      product_name: "Curso de Bolos",
      name: "Carla",
      phone: "11977776666",
      email: "carla@exemplo.com",
      status: "abandoned",
    });
    expect(carrinho).toMatchObject({
      plataforma: "kiwify",
      evento: "carrinho_abandonado",
      externalId: "kiwify:carrinho:+5511977776666:curso-de-bolos",
      chaveDoCarrinho: null,
    });
  });

  it("a compra aponta o carrinho da mesma pessoa e produto, para herdar o negócio dele", () => {
    const a = mapearAvisoDeVenda(kiwifyAprovada)!;
    expect(a.chaveDoCarrinho).toBe("kiwify:carrinho:+5511988887777:curso-de-bolos");
  });
});

describe("Cakto", () => {
  it("abandono: comprador plano, preço em reais vira centavos e valor legível", () => {
    expect(mapearAvisoDeVenda(caktoAbandono)).toMatchObject({
      plataforma: "cakto",
      evento: "carrinho_abandonado",
      name: "Bruno Lima",
      phone: "+5534999999999",
      valorEmCentavos: 9790,
      custom_fields: { produto: "Mentoria", link_checkout: "https://pay.cakto.com.br/B8BcHrY", valor: "R$ 97,90" },
    });
  });

  it("compra aprovada com o comprador em data.customer", () => {
    const r = mapearAvisoDeVenda({
      secret: "123",
      event: "purchase_approved",
      data: { id: "ord-9", customer: { name: "Davi", phone: "5521988776655", email: "d@x.com" }, product: { name: "E-book" }, amount: 47 },
    });
    expect(r).toMatchObject({ evento: "compra_aprovada", externalId: "cakto:ord-9", phone: "+5521988776655" });
  });
});

describe("evento → etapa do funil", () => {
  const etapas = [
    { id: "s1", name: "Novo" },
    { id: "s2", name: "Carrinho abandonado" },
    { id: "s3", name: "Aguardando Pagamento" },
    { id: "s4", name: "Pago" },
  ];
  it("casa pelo nome da etapa, sem diferença de maiúscula e acento", () => {
    expect(etapaDoEvento("carrinho_abandonado", etapas)).toBe("s2");
    expect(etapaDoEvento("aguardando_pagamento", etapas)).toBe("s3");
    expect(etapaDoEvento("compra_aprovada", etapas)).toBe("s4");
  });
  it("evento sem etapa com nome conhecido fica onde está", () => {
    expect(etapaDoEvento("reembolso", etapas)).toBeNull();
    expect(etapaDoEvento(null, etapas)).toBeNull();
  });
  it("vocabulário das duas plataformas", () => {
    expect(eventoDaVenda("compra_aprovada")).toBe("compra_aprovada");
    expect(eventoDaVenda("purchase_refused")).toBe("compra_recusada");
    expect(eventoDaVenda("boleto_gerado")).toBe("aguardando_pagamento");
    expect(eventoDaVenda("chargedback")).toBe("chargeback");
    expect(eventoDaVenda("qualquer")).toBeNull();
  });
});

describe("autenticidade do aviso", () => {
  it("Cakto: o secret do corpo tem de ser o segredo da fonte", async () => {
    const { avisoDaPlataformaAutentico } = await import("./plataformas-de-venda");
    expect(avisoDaPlataformaAutentico("{}", caktoAbandono, null, "123")).toBe(true);
    expect(avisoDaPlataformaAutentico("{}", caktoAbandono, null, "outro")).toBe(false);
  });
  it("Kiwify: ?signature= é o HMAC-SHA1 do corpo cru com o token", async () => {
    const { createHmac } = await import("node:crypto");
    const { avisoDaPlataformaAutentico } = await import("./plataformas-de-venda");
    const corpo = JSON.stringify(kiwifyAprovada);
    const assinatura = createHmac("sha1", "tok").update(corpo).digest("hex");
    expect(avisoDaPlataformaAutentico(corpo, kiwifyAprovada, assinatura, "tok")).toBe(true);
    expect(avisoDaPlataformaAutentico(corpo + " ", kiwifyAprovada, assinatura, "tok")).toBe(false);
    expect(avisoDaPlataformaAutentico(corpo, kiwifyAprovada, null, "tok")).toBe(false);
  });
});
