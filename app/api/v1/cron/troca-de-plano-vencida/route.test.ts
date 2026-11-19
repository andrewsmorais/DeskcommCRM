import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { aplicarTrocasVencidas } from "./route";

type Linha = Record<string, unknown>;

/** Um banco de mentira com o encadeamento que a rodada usa. */
function banco(linhas: Linha[], afetadas = 1) {
  const updates: Array<{ campos: Linha; filtros: Array<[string, unknown]> }> = [];
  const planos = [
    { id: "p-ess", slug: "essencial", price_monthly: 8990, price_quarterly: 24273, price_yearly: 86304 },
    { id: "p-imp", slug: "impulso", price_monthly: 14990, price_quarterly: 40473, price_yearly: 143904 },
  ];
  const admin = {
    from(tabela: string) {
      if (tabela === "plans") return { select: async () => ({ data: planos, error: null }) };
      const q: Record<string, unknown> = {};
      let atual: { campos: Linha; filtros: Array<[string, unknown]> } | null = null;
      q.select = (_c?: string) => {
        if (atual) return Promise.resolve({ data: Array.from({ length: afetadas }, () => ({ id: "s" })), error: null });
        return q;
      };
      q.eq = (c: string, v: unknown) => {
        atual?.filtros.push([c, v]);
        return q;
      };
      q.not = () => q;
      q.lte = () => q;
      q.order = () => q;
      q.limit = async () => ({ data: linhas, error: null });
      q.update = (campos: Linha) => {
        atual = { campos, filtros: [] };
        updates.push(atual);
        return q;
      };
      return q;
    },
  };
  return { admin: admin as never, updates };
}

describe("cron troca-de-plano-vencida", () => {
  it("na data, grava o plano menor com o preço do ciclo e limpa o pedido e a proposta", async () => {
    const { admin, updates } = banco([
      {
        id: "s1",
        organization_id: "o1",
        billing_cycle: "quarterly",
        troca_plano: "essencial",
        troca_efetiva_em: "2026-11-19T00:00:00.000Z",
      },
    ]);
    const r = await aplicarTrocasVencidas(admin, "req");
    expect(r).toEqual({ examinadas: 1, aplicadas: 1, falhas: 0 });
    expect(updates[0]!.campos).toMatchObject({
      plan_type: "essencial",
      plan_id: "p-ess",
      contracted_amount_cents: 24273,
      limites_personalizados: null,
      troca_tipo: null,
      troca_plano: null,
    });
    // Trava no pedido lido: se o webhook consolidou antes, nada muda.
    expect(updates[0]!.filtros).toEqual(
      expect.arrayContaining([
        ["troca_tipo", "downgrade"],
        ["troca_plano", "essencial"],
        ["troca_efetiva_em", "2026-11-19T00:00:00.000Z"],
      ]),
    );
  });

  it("pedido já consolidado por outro caminho: não conta como aplicado", async () => {
    const { admin } = banco(
      [{ id: "s1", organization_id: "o1", billing_cycle: "monthly", troca_plano: "impulso", troca_efetiva_em: "2026-11-19T00:00:00.000Z" }],
      0,
    );
    expect(await aplicarTrocasVencidas(admin, "req")).toEqual({ examinadas: 1, aplicadas: 0, falhas: 0 });
  });

  it("plano ou ciclo desconhecido é falha, sem escrita", async () => {
    const { admin, updates } = banco([
      { id: "s1", organization_id: "o1", billing_cycle: "semanal", troca_plano: "essencial", troca_efetiva_em: "2026-11-19T00:00:00.000Z" },
    ]);
    expect(await aplicarTrocasVencidas(admin, "req")).toEqual({ examinadas: 1, aplicadas: 0, falhas: 1 });
    expect(updates).toHaveLength(0);
  });
});
