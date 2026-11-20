import { afterEach, describe, expect, it, vi } from "vitest";

import { getOrganizationBilling } from "@/lib/billing";
import { extrasLidos } from "./catalogo";
import { extraForaDaOrganizacao, verificarExtra } from "./extras";

vi.mock("@/lib/billing", () => ({ getOrganizationBilling: vi.fn() }));

const ORG = "10000000-0000-4000-8000-000000000001";
const ativo = (extras: string[]) =>
  ({ ok: true, billing: { is_active: true, extras: extrasLidos(extras) } }) as never;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getOrganizationBilling).mockReset();
});

describe("extras cobrados à parte", () => {
  it("instalação que não vende planos libera sem ler nada", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "false");
    expect(await verificarExtra(ORG, "prospeccao")).toEqual({ ok: true });
    expect(getOrganizationBilling).not.toHaveBeenCalled();
  });

  it("nenhum plano inclui: só quem tem o extra ligado", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    vi.mocked(getOrganizationBilling).mockResolvedValue(ativo([]));
    expect(await verificarExtra(ORG, "ligacoes")).toMatchObject({ ok: false, code: "billing_extra" });
    vi.mocked(getOrganizationBilling).mockResolvedValue(ativo(["ligacoes"]));
    expect(await verificarExtra(ORG, "ligacoes")).toEqual({ ok: true });
  });

  it("valor desconhecido na coluna não vira extra", () => {
    expect(extrasLidos(["prospeccao", "brinde", 3, "prospeccao"])).toEqual(["prospeccao"]);
    expect(extrasLidos("prospeccao")).toEqual([]);
  });

  it("o motor fecha no fato e só passa na leitura indisponível", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    vi.mocked(getOrganizationBilling).mockResolvedValue({ ok: true, billing: null });
    expect(await extraForaDaOrganizacao(ORG, "nota_de_voz")).toBe(true);
    vi.mocked(getOrganizationBilling).mockResolvedValue({ ok: false, reason: "consulta_indisponivel" });
    expect(await extraForaDaOrganizacao(ORG, "nota_de_voz")).toBe(false);
  });
});
