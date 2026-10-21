import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));

import { validateOpenAIKey, validateProviderKey } from "./provider-validators";

const CHAVE_FICTICIA = "somente-fixture-openai-nao-e-uma-chave-real";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("validação da OpenAI — contrato autenticado sem geração paga", () => {
  it("consulta /models com Bearer no header, nunca com a chave na URL", async () => {
    const fetchFalso = vi.fn(async () =>
      Response.json({ data: [{ id: "gpt-4.1-mini" }, { id: "text-embedding-3-small" }] }),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const resultado = await validateProviderKey("openai", CHAVE_FICTICIA);

    expect(fetchFalso).toHaveBeenCalledExactlyOnceWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: `Bearer ${CHAVE_FICTICIA}` },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(resultado).toEqual({
      ok: true,
      models: ["gpt-4.1-mini", "text-embedding-3-small"],
    });
    expect(JSON.stringify(resultado)).not.toContain(CHAVE_FICTICIA);
  });

  it("catálogo vazio não inventa modelos ou prova de geração", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [] })),
    );

    expect(await validateOpenAIKey(CHAVE_FICTICIA)).toEqual({ ok: true, models: [] });
  });

  it.each([401, 403])("recusa HTTP %i sem ler ou expor o corpo do provedor", async (status) => {
    const json = vi.fn(async () => ({ error: { message: CHAVE_FICTICIA } }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status, ok: false, json })),
    );

    const resultado = await validateOpenAIKey(CHAVE_FICTICIA);

    expect(resultado).toEqual({ ok: false, error: "auth_failed_401" });
    expect(json).not.toHaveBeenCalled();
    expect(JSON.stringify(resultado)).not.toContain(CHAVE_FICTICIA);
  });

  it.each([429, 500, 503])(
    "preserva o status %i como falha, sem sucesso ou retry escondido",
    async (status) => {
      const fetchFalso = vi.fn(async () => new Response(null, { status }));
      vi.stubGlobal("fetch", fetchFalso);

      expect(await validateOpenAIKey(CHAVE_FICTICIA)).toEqual({
        ok: false,
        error: `provider_status_${status}`,
      });
      expect(fetchFalso).toHaveBeenCalledTimes(1);
    },
  );

  it("falha de rede não devolve mensagem que possa conter a chave", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError(`Falha fictícia ${CHAVE_FICTICIA}`);
      }),
    );

    expect(await validateOpenAIKey(CHAVE_FICTICIA)).toEqual({
      ok: false,
      error: "TypeError",
    });
  });

  it("JSON inválido não vira credencial validada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{json-ficticio-invalido")),
    );

    expect(await validateOpenAIKey(CHAVE_FICTICIA)).toEqual({
      ok: false,
      error: "SyntaxError",
    });
  });

  it("aborta em cinco segundos e encerra com falha de timeout", async () => {
    vi.useFakeTimers();
    let sinal: AbortSignal | null | undefined;
    const fetchFalso = vi.fn((_url: string, init: RequestInit) => {
      sinal = init.signal;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          // Error do mesmo realm do módulo; DOMException do jsdom pertence
          // ao browser simulado, enquanto este validador roda no servidor.
          const erro = new Error("Timeout fictício");
          erro.name = "AbortError";
          reject(erro);
        });
      });
    });
    vi.stubGlobal("fetch", fetchFalso);

    const verificacao = validateOpenAIKey(CHAVE_FICTICIA);
    await vi.advanceTimersByTimeAsync(5000);

    expect(sinal?.aborted).toBe(true);
    expect(await verificacao).toEqual({ ok: false, error: "AbortError" });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
