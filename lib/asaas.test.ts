import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteSubscription } from "./asaas";

const configuracao = vi.hoisted(() => ({
  ASAAS_API_KEY: "chave-ficticia-do-teste" as string | undefined,
  ASAAS_BASE_URL: undefined as string | undefined,
  NODE_ENV: "development",
}));
vi.mock("@/lib/env", () => ({ env: configuracao }));

const fetchSimulado = vi.fn<typeof fetch>();
const ASSINATURA = "sub_assinatura_ficticia_123";

beforeEach(() => {
  vi.resetAllMocks();
  configuracao.ASAAS_API_KEY = "chave-ficticia-do-teste";
  configuracao.ASAAS_BASE_URL = undefined;
  configuracao.NODE_ENV = "development";
  fetchSimulado.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchSimulado);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cancelamento de recorrência no Asaas", () => {
  it.each(["development", "test"])("%s usa sandbox por padrão", async (ambiente) => {
    configuracao.NODE_ENV = ambiente;

    await expect(deleteSubscription(ASSINATURA)).resolves.toEqual({ ok: true, deleted: true });

    expect(fetchSimulado).toHaveBeenCalledExactlyOnceWith(
      `https://api-sandbox.asaas.com/v3/subscriptions/${ASSINATURA}`,
      {
        method: "DELETE",
        headers: { access_token: "chave-ficticia-do-teste", "Content-Type": "application/json" },
        signal: expect.anything(),
      },
    );
  });

  it("produção usa a API de produção por padrão", async () => {
    configuracao.NODE_ENV = "production";

    await deleteSubscription(ASSINATURA);

    expect(fetchSimulado).toHaveBeenCalledWith(
      `https://api.asaas.com/v3/subscriptions/${ASSINATURA}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it.each([
    { ambiente: "development", base: "https://api.asaas.com" },
    { ambiente: "production", base: "https://api-sandbox.asaas.com" },
  ])(
    "configuração explícita permitida prevalece no ambiente $ambiente",
    async ({ ambiente, base }) => {
      configuracao.NODE_ENV = ambiente;
      configuracao.ASAAS_BASE_URL = base;

      await deleteSubscription(ASSINATURA);

      expect(fetchSimulado).toHaveBeenCalledWith(
        `${base}/v3/subscriptions/${ASSINATURA}`,
        expect.objectContaining({
          headers: { access_token: "chave-ficticia-do-teste", "Content-Type": "application/json" },
        }),
      );
    },
  );

  it.each([
    "https://outro-provedor.invalid",
    "http://api.asaas.com",
    "https://api.asaas.com/",
    "https://api.asaas.com.exemplo.invalid",
    "https://api.asaas.com@exemplo.invalid",
  ])("base fora da lista permitida é recusada antes da requisição: %s", async (base) => {
    configuracao.ASAAS_BASE_URL = base;

    await expect(deleteSubscription(ASSINATURA)).rejects.toThrow("asaas_unavailable");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])("chave ausente impede a requisição", async (chave) => {
    configuracao.ASAAS_API_KEY = chave;

    await expect(deleteSubscription(ASSINATURA)).rejects.toThrow("asaas_unavailable");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "sub_",
    "outro_123",
    "sub_123/outra",
    "sub_123?token=teste",
    "sub_123#fragmento",
    "sub_123\n",
  ])("id inválido impede a requisição: %j", async (id) => {
    await expect(deleteSubscription(id)).rejects.toThrow("asaas_unavailable");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("404 não comprova cancelamento e não devolve deleted", async () => {
    fetchSimulado.mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(deleteSubscription(ASSINATURA)).rejects.toThrow("asaas_cancel_failed");
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 429, 500, 503])(
    "HTTP %s responde erro sem revelar o conteúdo do provedor",
    async (status) => {
      fetchSimulado.mockResolvedValueOnce(
        new Response("detalhe privado da cobrança fictícia", { status }),
      );

      const erro: unknown = await deleteSubscription(ASSINATURA).catch((causa: unknown) => causa);

      expect(erro).toBeInstanceOf(Error);
      expect(erro).toMatchObject({ message: "asaas_cancel_failed" });
      expect(String(erro)).not.toContain("detalhe privado");
      expect(String(erro)).not.toContain("chave-ficticia-do-teste");
    },
  );

  it.each([200, 201, 204])("HTTP %s confirma o cancelamento", async (status) => {
    fetchSimulado.mockResolvedValueOnce(new Response(null, { status }));

    await expect(deleteSubscription(ASSINATURA)).resolves.toEqual({ ok: true, deleted: true });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });
});
