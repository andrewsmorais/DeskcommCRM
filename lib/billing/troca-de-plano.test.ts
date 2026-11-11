import { describe, expect, it } from "vitest";

import { decidirTroca, planoEmVigor, precoDoCiclo, type PedidoDeTroca } from "./troca-de-plano";

const ESSENCIAL = { price_monthly: 8990, price_quarterly: 24273, price_yearly: 86304 };
const IMPULSO = { price_monthly: 14990, price_quarterly: 40473, price_yearly: 143904 };

// Período de 30 dias, com 15 dias já usados.
const pedido = (o: Partial<PedidoDeTroca> = {}): PedidoDeTroca => ({
  planoAtual: "essencial",
  planoNovo: "impulso",
  ciclo: "monthly",
  status: "active",
  canceladaEm: null,
  inicioDoPeriodo: "2026-11-01T00:00:00.000Z",
  fimDoPeriodo: "2026-12-01T00:00:00.000Z",
  precoAtual: ESSENCIAL,
  precoNovo: IMPULSO,
  agora: new Date("2026-11-16T00:00:00.000Z"),
  ...o,
});

describe("troca de plano — a régua da Umbler Talk", () => {
  it("upgrade no meio do período cobra a diferença proporcional e espera o pagamento", () => {
    const d = decidirTroca(pedido());
    expect(d).toMatchObject({ ok: true, tipo: "upgrade", aplicarAgora: false, diasRestantes: 15 });
    // (14990 − 8990) × 15/30 = 3000
    expect(d.ok && d.valorCents).toBe(3000);
    expect(d.ok && d.novoValorDoCicloCents).toBe(14990);
  });

  it("upgrade no anual usa o preço do ciclo inteiro", () => {
    const d = decidirTroca(
      pedido({
        ciclo: "yearly",
        inicioDoPeriodo: "2026-01-01T00:00:00.000Z",
        fimDoPeriodo: "2027-01-01T00:00:00.000Z",
        agora: new Date("2026-07-02T12:00:00.000Z"),
      }),
    );
    expect(d.ok && d.valorCents).toBe(Math.round((143904 - 86304) * 0.5));
  });

  it("diferença abaixo do mínimo do Asaas (R$ 5) não vira cobrança: vale na hora", () => {
    const d = decidirTroca(pedido({ agora: new Date("2026-11-30T23:00:00.000Z") }));
    expect(d).toMatchObject({ ok: true, tipo: "upgrade", aplicarAgora: true, valorCents: 0 });
  });

  it("downgrade vale no fim do período pago, sem devolução", () => {
    const d = decidirTroca(
      pedido({
        planoAtual: "impulso",
        planoNovo: "essencial",
        precoAtual: IMPULSO,
        precoNovo: ESSENCIAL,
      }),
    );
    expect(d).toMatchObject({
      ok: true,
      tipo: "downgrade",
      aplicarAgora: false,
      valorCents: 0,
      efetivaEm: "2026-12-01T00:00:00.000Z",
      novoValorDoCicloCents: 8990,
    });
  });

  it("no teste grátis a troca vale na hora, nos dois sentidos", () => {
    expect(decidirTroca(pedido({ status: "trialing" }))).toMatchObject({
      ok: true,
      aplicarAgora: true,
      valorCents: 0,
    });
    expect(
      decidirTroca(
        pedido({
          status: "trialing",
          planoAtual: "impulso",
          planoNovo: "essencial",
          precoAtual: IMPULSO,
          precoNovo: ESSENCIAL,
        }),
      ),
    ).toMatchObject({ ok: true, tipo: "downgrade", aplicarAgora: true });
  });

  it("recusa: mesmo plano, Escala, cancelada, atrasada ou com período vencido", () => {
    expect(decidirTroca(pedido({ planoNovo: "essencial" }))).toEqual({
      ok: false,
      motivo: "mesmo_plano",
    });
    expect(decidirTroca(pedido({ planoNovo: "escala" }))).toEqual({
      ok: false,
      motivo: "sob_consulta",
    });
    expect(decidirTroca(pedido({ planoAtual: "escala" }))).toEqual({
      ok: false,
      motivo: "sob_consulta",
    });
    expect(decidirTroca(pedido({ canceladaEm: "2026-11-10T00:00:00.000Z" }))).toEqual({
      ok: false,
      motivo: "assinatura_cancelada",
    });
    expect(decidirTroca(pedido({ status: "past_due" }))).toEqual({
      ok: false,
      motivo: "assinatura_inativa",
    });
    expect(decidirTroca(pedido({ agora: new Date("2026-12-02T00:00:00.000Z") }))).toEqual({
      ok: false,
      motivo: "assinatura_inativa",
    });
  });

  it("sem início gravado, o período tem o tamanho do ciclo", () => {
    const d = decidirTroca(pedido({ inicioDoPeriodo: null }));
    expect(d.ok && d.valorCents).toBe(3000);
  });

  it("preço do ciclo segue o checkout (trimestral e anual com desconto)", () => {
    expect(precoDoCiclo(IMPULSO, "quarterly")).toBe(40473);
    expect(
      precoDoCiclo({ price_monthly: 100, price_quarterly: null, price_yearly: null }, "yearly"),
    ).toBe(1200);
  });
});

describe("plano em vigor", () => {
  const base = { plan_type: "impulso", troca_tipo: "downgrade", troca_plano: "essencial" };
  it("downgrade só vale depois da data", () => {
    const agora = new Date("2026-11-16T00:00:00.000Z");
    expect(planoEmVigor({ ...base, troca_efetiva_em: "2026-12-01T00:00:00.000Z" }, agora)).toBe(
      "impulso",
    );
    expect(planoEmVigor({ ...base, troca_efetiva_em: "2026-11-01T00:00:00.000Z" }, agora)).toBe(
      "essencial",
    );
  });
  it("upgrade pendente nunca vale antes do pagamento", () => {
    expect(
      planoEmVigor(
        {
          plan_type: "essencial",
          troca_tipo: "upgrade",
          troca_plano: "impulso",
          troca_efetiva_em: null,
        },
        new Date("2030-01-01T00:00:00.000Z"),
      ),
    ).toBe("essencial");
  });
});
