import { describe, expect, it } from "vitest";

import { mapearAvisoDaLoja } from "@/lib/webhooks/lojas";
import { triarCarrinhos } from "@/app/api/v1/cron/nuvemshop-checkouts/route";

import { avisoDoCarrinho, avisoDoPedido, eventoDoPedido, produtoDaCompra } from "./venda";

const semCabecalho = { get: () => null };

const pedido = (extra: Record<string, unknown> = {}) => ({
  id: 871254203,
  number: 101,
  contact_name: "Maria Souza",
  contact_phone: "+55 11 98765-4321",
  contact_email: "maria@example.com",
  products: [{ name: "Vestido Floral", price: "149.90", quantity: 1 }],
  total: "149.90",
  status: "open",
  payment_status: "pending",
  ...extra,
});

describe("eventoDoPedido", () => {
  it("lê a situação do pagamento como as outras lojas", () => {
    expect(eventoDoPedido(pedido())).toBe("aguardando_pagamento");
    expect(eventoDoPedido(pedido({ payment_status: "paid" }))).toBe("compra_aprovada");
    expect(eventoDoPedido(pedido({ payment_status: "authorized" }))).toBe("compra_aprovada");
    expect(eventoDoPedido(pedido({ payment_status: "refunded" }))).toBe("reembolso");
    expect(eventoDoPedido(pedido({ payment_status: "voided" }))).toBe("pagamento_expirado");
  });

  it("pedido cancelado com pagamento pendente é o Pix ou boleto que venceu", () => {
    expect(eventoDoPedido(pedido({ status: "cancelled" }))).toBe("pagamento_expirado");
  });

  it("cancelado depois de pago não é evento (o reembolso vem no aviso dele)", () => {
    expect(eventoDoPedido(pedido({ status: "cancelled", payment_status: "partially_paid" }))).toBeNull();
  });
});

describe("produtoDaCompra", () => {
  it("o primeiro item e 'e mais N'", () => {
    expect(produtoDaCompra([{ name: "A" }])).toBe("A");
    expect(produtoDaCompra([{ name: "A" }, { name: "B" }, { name: "C" }])).toBe("A e mais 2");
    expect(produtoDaCompra([])).toBeNull();
  });
});

describe("avisoDoPedido → Captação", () => {
  it("vira um aviso de venda que a Captação reconhece", () => {
    const corpo = avisoDoPedido(pedido());
    expect(corpo).toMatchObject({
      evento_da_venda: "aguardando_pagamento",
      plataforma: "nuvemshop",
      nome: "Maria Souza",
      produto: "Vestido Floral",
      valor: "149.90",
      id_do_pedido: "nuvemshop-871254203",
    });
    const aviso = mapearAvisoDaLoja(corpo!, semCabecalho);
    expect(aviso?.evento).toBe("aguardando_pagamento");
    expect(aviso?.phone).toBe("+5511987654321");
    expect(aviso?.valorEmCentavos).toBe(14990);
    expect(aviso?.custom_fields.plataforma).toBe("nuvemshop");
  });

  it("sem telefone e sem e-mail não há com quem falar", () => {
    expect(avisoDoPedido(pedido({ contact_phone: null, contact_email: null }))).toBeNull();
  });

  it("o telefone do cliente serve quando o do contato falta", () => {
    const corpo = avisoDoPedido(pedido({ contact_phone: null, customer: { phone: "11987654321" } }));
    expect(corpo?.telefone).toBe("11987654321");
  });
});

describe("avisoDoCarrinho", () => {
  const carrinho = {
    id: 411335234,
    contact_name: "Maria Souza",
    contact_phone: "11987654321",
    contact_email: "maria@example.com",
    products: [{ name: "Vestido Floral" }],
    total: "149.90",
    abandoned_checkout_url: "https://loja.example.com/checkout/v3/next/411335234/abc",
    completed_at: null,
  };

  it("leva o link que retoma a compra", () => {
    expect(avisoDoCarrinho(carrinho)).toMatchObject({
      evento_da_venda: "carrinho_abandonado",
      link_checkout: carrinho.abandoned_checkout_url,
    });
  });

  it("o pedido herda o negócio do carrinho (mesma chave)", () => {
    const doCarrinho = mapearAvisoDaLoja(avisoDoCarrinho(carrinho)!, semCabecalho);
    const doPedido = mapearAvisoDaLoja(avisoDoPedido(pedido({ contact_phone: "11987654321" }))!, semCabecalho);
    expect(doCarrinho?.externalId).toBeTruthy();
    expect(doPedido?.chaveDoCarrinho).toBe(doCarrinho?.externalId);
  });

  it("carrinho que virou pedido não é avisado de novo", () => {
    expect(avisoDoCarrinho({ ...carrinho, completed_at: "2026-11-20T10:00:00-03:00" })).toBeNull();
  });
});

describe("triarCarrinhos", () => {
  const agora = Date.parse("2026-11-20T15:00:00Z");
  const em = (min: number) => new Date(agora - min * 60_000).toISOString();

  it("para no carrinho novo demais e não pula o que vem depois dele", () => {
    const r = triarCarrinhos(
      [
        { id: 3, updated_at: em(10) },
        { id: 1, updated_at: em(60) },
        { id: 2, updated_at: em(45) },
      ],
      agora,
    );
    expect(r.entregar.map((c) => c.id)).toEqual([1, 2]);
    expect(r.cursor).toBe(2);
  });

  it("o mais velho que um dia só move o cursor", () => {
    const r = triarCarrinhos(
      [
        { id: 1, updated_at: em(60 * 30) },
        { id: 2, updated_at: em(40) },
      ],
      agora,
    );
    expect(r.entregar.map((c) => c.id)).toEqual([2]);
    expect(r.cursor).toBe(2);
  });

  it("tudo novo demais: o cursor não anda", () => {
    expect(triarCarrinhos([{ id: 5, updated_at: em(5) }], agora)).toEqual({ entregar: [], cursor: null });
  });
});
