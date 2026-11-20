/**
 * SAIR DA CONTA CALA O AVISO (auditoria 18/11, achado 20).
 *
 * Sair apagava a sessão e deixava a inscrição Web Push no banco: o servidor
 * seguia mandando mensagem de cliente para a tela de bloqueio de um aparelho
 * sem ninguém logado. Mede a limpeza do servidor (só a pessoa, só o navegador
 * quando há endereço, todas quando não há) e o cancelamento no navegador.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { encerrarPushDesteNavegador } from "./push_client";
import { removerPushAoSair } from "./web_push";

function adminFalso() {
  const filtros: Array<[string, string]> = [];
  const q = {
    delete: () => q,
    eq: (col: string, val: string) => {
      filtros.push([col, val]);
      return q;
    },
    then: (ok: (r: { error: null }) => void) => ok({ error: null }),
  };
  const admin = { from: vi.fn(() => q) };
  return { admin, filtros };
}

describe("removerPushAoSair", () => {
  it("com endereço, apaga só a inscrição deste navegador, desta pessoa", async () => {
    const { admin, filtros } = adminFalso();
    await removerPushAoSair("u1", "https://push/x", () => admin as never);
    expect(admin.from).toHaveBeenCalledWith("push_subscriptions");
    expect(filtros).toEqual([
      ["user_id", "u1"],
      ["endpoint", "https://push/x"],
    ]);
  });

  it("sem endereço, apaga todas as da pessoa (sair de todos os dispositivos)", async () => {
    const { admin, filtros } = adminFalso();
    await removerPushAoSair("u1", null, () => admin as never);
    expect(filtros).toEqual([["user_id", "u1"]]);
  });

  it("nunca lança: sair da conta não falha por causa da limpeza", async () => {
    await expect(
      removerPushAoSair("u1", null, () => {
        throw new Error("sem service key");
      }),
    ).resolves.toBeUndefined();
  });
});

describe("encerrarPushDesteNavegador", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cancela a inscrição no navegador e devolve o endereço", async () => {
    const unsubscribe = vi.fn(async () => true);
    const reg = {
      pushManager: {
        getSubscription: async () => ({ endpoint: "https://push/este", unsubscribe }),
      },
    };
    vi.stubGlobal("navigator", { serviceWorker: { getRegistrations: async () => [reg] } });
    await expect(encerrarPushDesteNavegador()).resolves.toBe("https://push/este");
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("sem inscrição, devolve nulo", async () => {
    const reg = { pushManager: { getSubscription: async () => null } };
    vi.stubGlobal("navigator", { serviceWorker: { getRegistrations: async () => [reg] } });
    await expect(encerrarPushDesteNavegador()).resolves.toBeNull();
  });

  it("navegador que não responde não prende a saída", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistrations: () => new Promise(() => {}) },
    });
    await expect(encerrarPushDesteNavegador(20)).resolves.toBeNull();
  });
});
