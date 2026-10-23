import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canUse, getOrganizationBilling, type OrganizationBilling } from "@/lib/billing";
import { comReservaDeCota, ErroDaReservaDeCota } from "@/lib/billing/reserva";
import { comCotaDeCanal } from "./cota-do-plano";

// Estes casos medem a camada comercial LIGADA (EXIGIR_ASSINATURA=true, como no
// ChatAI Online). Desligada é o padrão — ver lib/billing/exigencia.ts.
beforeEach(() => {
  vi.stubEnv("EXIGIR_ASSINATURA", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});


vi.mock("@/lib/billing", () => ({ canUse: vi.fn(), getOrganizationBilling: vi.fn() }));
vi.mock("@/lib/billing/reserva", () => ({
  comReservaDeCota: vi.fn(),
  ErroDaReservaDeCota: class extends Error {
    constructor(public readonly status: 409 | 503) {
      super(`Reserva indisponível: ${status}`);
    }
  },
}));

const ORG = "org-confiavel";
const billing: OrganizationBilling = {
  organization_id: ORG,
  plan_name: "Essencial",
  plan_slug: "essencial",
  limits: { whatsapp: 2 },
  status: "active",
  current_period_end: "2999-01-01T00:00:00Z",
  asaas_subscription_id: null,
  is_active: true,
  seats: 2,
  billing_cycle: "monthly",
};

function banco({
  active = false,
  existingError = false,
  count = 2,
  countError = false,
}: {
  active?: boolean;
  existingError?: boolean;
  count?: number | null;
  countError?: boolean;
} = {}) {
  const consulta = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({
        data: active ? { id: "canal" } : null,
        error: existingError ? { message: "indisponível" } : null,
      }),
  };
  const contagem = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi
      .fn()
      .mockResolvedValue({ count, error: countError ? { message: "indisponível" } : null }),
  };
  const select = vi.fn((_fields: string, options?: { count?: string }) =>
    options?.count ? contagem : consulta,
  );
  const from = vi.fn(() => ({ select }));
  return { db: { from } as unknown as SupabaseClient, from, select, consulta, contagem };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(comReservaDeCota).mockImplementation(async (_org, _recurso, operacao) => operacao());
  vi.mocked(getOrganizationBilling).mockResolvedValue({ ok: true, billing });
  vi.mocked(canUse).mockReturnValue({ ok: false, limite: 2 });
});

describe("cota compartilhada dos canais WhatsApp", () => {
  it.each([null, "canal-arquivado"])(
    "bloqueia criação ou reativação %s no limite antes do efeito",
    async (existingId) => {
      const stub = banco();
      const efeito = vi.fn(async () => "gravado");
      const recusar = vi.fn((_message: string, status: number) => `recusado-${status}`);
      expect(await comCotaDeCanal(stub.db, ORG, existingId, efeito, recusar)).toBe("recusado-403");
      expect(efeito).not.toHaveBeenCalled();
      expect(comReservaDeCota).toHaveBeenCalledWith(ORG, "whatsapp", expect.any(Function));
      expect(canUse).toHaveBeenCalledWith(billing, "whatsapp", 2);
      expect(stub.contagem.eq).toHaveBeenCalledWith("organization_id", ORG);
      expect(stub.contagem.is).toHaveBeenCalledWith("archived_at", null);
      expect(stub.contagem.in).toHaveBeenCalledWith("provider", [
        "waha",
        "meta_cloud",
        "zernio",
        "datafy",
      ]);
      if (existingId) expect(stub.consulta.eq).toHaveBeenCalledWith("id", existingId);
    },
  );

  it("permite adicionar abaixo do limite e executa uma vez dentro da reserva", async () => {
    const stub = banco({ count: 1 });
    const efeito = vi.fn(async () => "gravado");
    vi.mocked(canUse).mockReturnValue({ ok: true, limite: 2 });
    expect(await comCotaDeCanal(stub.db, ORG, null, efeito, () => "recusado")).toBe("gravado");
    expect(efeito).toHaveBeenCalledTimes(1);
    expect(canUse).toHaveBeenCalledWith(billing, "whatsapp", 1);
  });

  it("permite reparar credencial do canal ativo sem ocupar nova vaga", async () => {
    const stub = banco({ active: true });
    const efeito = vi.fn(async () => "reparado");
    expect(await comCotaDeCanal(stub.db, ORG, "canal", efeito, () => "recusado")).toBe("reparado");
    expect(efeito).toHaveBeenCalledTimes(1);
    expect(stub.consulta.eq).toHaveBeenCalledWith("organization_id", ORG);
    expect(getOrganizationBilling).not.toHaveBeenCalled();
    expect(canUse).not.toHaveBeenCalled();
    expect(stub.contagem.in).not.toHaveBeenCalled();
  });

  it.each([{ countError: true }, { count: null }])(
    "falha de contagem %j não permite criar",
    async (cenario) => {
      const stub = banco(cenario);
      const efeito = vi.fn(async () => "gravado");
      const recusar = vi.fn((_message: string, status: number) => `recusado-${status}`);
      expect(await comCotaDeCanal(stub.db, ORG, null, efeito, recusar)).toBe("recusado-503");
      expect(efeito).not.toHaveBeenCalled();
      expect(canUse).not.toHaveBeenCalled();
    },
  );

  it("falha ao conferir canal existente não transforma reparo em criação", async () => {
    const stub = banco({ existingError: true });
    const efeito = vi.fn(async () => "gravado");
    expect(
      await comCotaDeCanal(
        stub.db,
        ORG,
        "canal",
        efeito,
        (_message, status) => `recusado-${status}`,
      ),
    ).toBe("recusado-503");
    expect(efeito).not.toHaveBeenCalled();
    expect(getOrganizationBilling).not.toHaveBeenCalled();
  });

  it("falha de leitura comercial não executa o efeito", async () => {
    const stub = banco({ count: 0 });
    const efeito = vi.fn(async () => "gravado");
    vi.mocked(getOrganizationBilling).mockResolvedValue({
      ok: false,
      reason: "consulta_indisponivel",
    });
    expect(
      await comCotaDeCanal(stub.db, ORG, null, efeito, (_message, status) => `recusado-${status}`),
    ).toBe("recusado-503");
    expect(efeito).not.toHaveBeenCalled();
  });

  it.each([409, 503] as const)("reserva recusada preserva status %s", async (status) => {
    const stub = banco();
    const efeito = vi.fn(async () => "gravado");
    const error = new ErroDaReservaDeCota(status);
    vi.mocked(comReservaDeCota).mockRejectedValue(error);
    const recusar = vi.fn((_message: string, codigo: number) => `recusado-${codigo}`);
    expect(await comCotaDeCanal(stub.db, ORG, null, efeito, recusar)).toBe(`recusado-${status}`);
    expect(recusar).toHaveBeenCalledWith(error.message, status);
    expect(efeito).not.toHaveBeenCalled();
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("propaga falha do efeito sem convertê-la em recusa comercial", async () => {
    const stub = banco({ active: true });
    const error = new Error("Falha ao salvar credencial");
    await expect(
      comCotaDeCanal(
        stub.db,
        ORG,
        "canal",
        async () => {
          throw error;
        },
        () => "recusado",
      ),
    ).rejects.toBe(error);
  });
});
