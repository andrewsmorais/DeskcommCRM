import { afterEach, describe, expect, it, vi } from "vitest";

const contagem = vi.hoisted(() => ({ count: 1 as number | null, error: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: async () => ({ count: contagem.count, error: contagem.error }) }),
  }),
}));

import { troncoDaInstalacaoLiberado } from "./tronco-da-instalacao";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  contagem.count = 1;
  contagem.error = null;
});

describe("tronco SIP da instalação", () => {
  it("sem VOIP_TRUNK_ENDPOINT não há tronco a liberar", async () => {
    delete process.env.VOIP_TRUNK_ENDPOINT;
    expect(await troncoDaInstalacaoLiberado()).toBe(false);
  });

  it("instalação de uma organização só: o tronco é dela", async () => {
    process.env.VOIP_TRUNK_ENDPOINT = "PJSIP/trunk-endpoint";
    expect(await troncoDaInstalacaoLiberado()).toBe(true);
  });

  it("várias organizações: o tronco do operador não vira de todo mundo", async () => {
    process.env.VOIP_TRUNK_ENDPOINT = "PJSIP/trunk-endpoint";
    contagem.count = 3;
    expect(await troncoDaInstalacaoLiberado()).toBe(false);
  });

  it("várias organizações com VOIP_TRUNK_COMPARTILHADO=ligado: o operador escolheu compartilhar", async () => {
    process.env.VOIP_TRUNK_ENDPOINT = "PJSIP/trunk-endpoint";
    process.env.VOIP_TRUNK_COMPARTILHADO = "ligado";
    contagem.count = 3;
    expect(await troncoDaInstalacaoLiberado()).toBe(true);
  });

  it("leitura indisponível não libera", async () => {
    process.env.VOIP_TRUNK_ENDPOINT = "PJSIP/trunk-endpoint";
    contagem.error = { message: "fora do ar" };
    expect(await troncoDaInstalacaoLiberado()).toBe(false);
  });
});
