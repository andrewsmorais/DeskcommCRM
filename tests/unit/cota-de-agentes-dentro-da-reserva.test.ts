/**
 * Contar a cota de agentes e criar o agente acontecem DENTRO da mesma reserva.
 *
 * `conferirCotaDeAgentes` sozinha era confere-e-depois-age: N pedidos
 * simultâneos no limite liam a mesma contagem e criavam todos. O teste fixa
 * três coisas de `criarDentroDaCotaDeAgentes`:
 *   1. com planos à venda, a contagem e a criação rodam DENTRO de
 *      `comReservaDeCota(org, "agentes")`;
 *   2. cota estourada recusa sem chamar a criação;
 *   3. reserva disputada (409) vira recusa `conflict`, não exceção solta;
 * e que sem venda de planos (ou isento) não há reserva nenhuma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  exigida: true,
  dentroDaReserva: false,
  reservas: [] as string[],
  falhaDaReserva: null as null | 409 | 503,
  contagem: 1,
  limite: 1,
}));

vi.mock("@/lib/billing/exigencia", () => ({ assinaturaExigida: () => estado.exigida }));
vi.mock("@/lib/billing/reserva", () => {
  class ErroDaReservaDeCota extends Error {
    constructor(public readonly status: 409 | 503) {
      super(status === 409 ? "Outra alteração desta cota está em andamento." : "Sem reserva.");
    }
  }
  return {
    ErroDaReservaDeCota,
    comReservaDeCota: async (_org: string, recurso: string, op: () => Promise<unknown>) => {
      if (estado.falhaDaReserva) throw new ErroDaReservaDeCota(estado.falhaDaReserva);
      estado.reservas.push(recurso);
      estado.dentroDaReserva = true;
      try {
        return await op();
      } finally {
        estado.dentroDaReserva = false;
      }
    },
  };
});
vi.mock("@/lib/billing", () => ({
  getOrganizationBilling: async () => ({ ok: true, billing: { plan_name: "Essencial" } }),
  canUse: (_b: unknown, _r: string, atual: number) =>
    atual < estado.limite ? { ok: true } : { ok: false, limite: estado.limite },
}));

import { criarDentroDaCotaDeAgentes } from "@/lib/billing/cota-de-agentes";

function adminQueConta() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: async () => {
            expect(estado.dentroDaReserva).toBe(true);
            return { count: estado.contagem, error: null };
          },
        }),
      }),
    }),
  } as never;
}

beforeEach(() => {
  estado.exigida = true;
  estado.reservas = [];
  estado.falhaDaReserva = null;
  estado.contagem = 0;
  estado.limite = 1;
});

describe("criarDentroDaCotaDeAgentes", () => {
  it("com folga: conta e cria DENTRO da reserva de agentes", async () => {
    const criar = vi.fn(async () => {
      expect(estado.dentroDaReserva).toBe(true);
      return "criado";
    });
    const r = await criarDentroDaCotaDeAgentes(adminQueConta(), "org", {}, () => "recusado", criar);
    expect(r).toBe("criado");
    expect(estado.reservas).toEqual(["agentes"]);
  });

  it("no limite: recusa com billing_limit e não cria", async () => {
    estado.contagem = 1;
    const criar = vi.fn(async () => "criado");
    const r = await criarDentroDaCotaDeAgentes(adminQueConta(), "org", {}, (c) => c.code, criar);
    expect(r).toBe("billing_limit");
    expect(criar).not.toHaveBeenCalled();
  });

  it("reserva disputada: recusa conflict (409), sem exceção solta", async () => {
    estado.falhaDaReserva = 409;
    const criar = vi.fn(async () => "criado");
    const r = await criarDentroDaCotaDeAgentes(
      adminQueConta(),
      "org",
      {},
      (c) => `${c.code}:${c.status}`,
      criar,
    );
    expect(r).toBe("conflict:409");
    expect(criar).not.toHaveBeenCalled();
  });

  it("sem venda de planos, ou isento: cria direto, sem reserva", async () => {
    estado.exigida = false;
    expect(
      await criarDentroDaCotaDeAgentes(
        {} as never,
        "org",
        {},
        () => "x",
        async () => "criado",
      ),
    ).toBe("criado");
    estado.exigida = true;
    expect(
      await criarDentroDaCotaDeAgentes(
        {} as never,
        "org",
        { isento: true },
        () => "x",
        async () => "criado",
      ),
    ).toBe("criado");
    expect(estado.reservas).toEqual([]);
  });
});
