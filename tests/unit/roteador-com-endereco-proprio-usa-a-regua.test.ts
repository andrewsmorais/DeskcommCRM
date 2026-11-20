/**
 * O ENDEREÇO PRÓPRIO DE OPENROUTER, DEEPSEEK E REQUESTY PASSA PELA RÉGUA DE
 * DESTINO DE ORGANIZAÇÃO — como o do provedor personalizado.
 *
 * ═══ O achado ═══
 *
 * O admin da organização grava `ai_purpose_bindings.base_url` para um desses
 * três roteadores, e a escrita só conferia `z.string().url()`. No motor, a
 * fábrica montava a allowlist do egress A PARTIR do próprio endereço — que
 * aprova qualquer host que a empresa nomear —, e a pilha antiga
 * (`gateway-binding.ts`) usava o `fetch` global puro. Só o `custom` passava por
 * `fetchParaDestinoDaOrganizacao`. Reproduzido pela auditoria: o `custom` era
 * recusado com `unsafe_url:private_host`, e os três roteadores mandavam POST a
 * um servidor em 127.0.0.1, nas duas pilhas; o PUT gravava
 * `http://127.0.0.1:6379/v1` sem reclamar.
 *
 * ═══ O que se mede aqui ═══
 *
 *   1. As duas pilhas (registry do motor e `resolverModeloDoPonto`) com
 *      endereço interno: a chamada é recusada e o `fetch` nunca é chamado.
 *   2. Controles: endereço público e endpoint canônico SAEM — sem eles uma
 *      fábrica que recusasse tudo passaria.
 *   3. A escrita: PUT /api/v1/ai/providers recusa o endereço interno com 422 e
 *      não grava.
 *
 * O DNS é controlado (a régua resolve o nome antes de a chave sair): o nome
 * `redis` imita o serviço do compose; o resto resolve para um IP público.
 */
import { generateText, type LanguageModel } from "ai";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  binding: null as Record<string, unknown> | null,
  escritas: [] as string[],
  requireRole: vi.fn(),
}));

vi.mock("node:dns/promises", () => {
  const mapa: Record<string, string> = { redis: "172.18.0.5" };
  const lookup = vi.fn(async (nome: string) => [
    { address: mapa[nome] ?? "93.184.216.34", family: 4 },
  ]);
  return { lookup, default: { lookup } };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "is"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: tabela === "ai_purpose_bindings" ? h.binding : { api_key_encrypted: "x" },
      });
      return chain;
    },
  }),
}));
vi.mock("@/lib/crypto/aes_gcm", () => ({
  decryptKey: () => "chave-da-organizacao",
  byteaToBuffer: (v: unknown) => v,
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is"]) chain[m] = () => chain;
      chain.upsert = () => {
        h.escritas.push(`upsert:${tabela}`);
        return chain;
      };
      chain.maybeSingle = async () => ({
        data:
          tabela === "ai_models"
            ? { model_id: "modelo-x", supports_tools: true, supports_vision: false }
            : tabela === "ai_provider_credentials"
              ? { id: "cred-1", provider: "openrouter" }
              : { id: "binding-1" },
        error: null,
      });
      return chain;
    },
  }),
}));

import { createDefaultRegistry } from "@/lib/agent-engine/edge/llm/providers";
import { resolverModeloDoPonto } from "@/lib/ai/gateway-binding";

const ORG = "14000000-0000-4000-8000-000000000001";
const CREDENCIAL = "14000000-0000-4000-8000-000000000002";
const registry = createDefaultRegistry();

const INTERNOS: Array<[string, string]> = [
  ["loopback", "http://127.0.0.1:4000/v1"],
  ["serviço do compose", "http://redis:6379/v1"],
  ["metadata da nuvem", "http://169.254.169.254/v1"],
];
const ROTEADORES = ["openrouter", "deepseek", "requesty"] as const;

function espiao() {
  const fetch = vi.fn(
    async (_url: unknown, _init?: unknown) => new Response("{}", { status: 500 }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registry do motor — roteador com endereço da organização", () => {
  for (const provedor of ROTEADORES) {
    it.each(INTERNOS)(`${provedor} + %s: recusa, e nada sai`, async (_rotulo, endereco) => {
      const fetch = espiao();
      const model = registry[provedor]!("sk-x", "modelo-x", endereco);

      await expect(generateText({ model, prompt: "oi", maxRetries: 0 })).rejects.toThrow(
        /unsafe_url:/,
      );
      expect(fetch, "a chamada saiu para a rede interna").not.toHaveBeenCalled();
    });

    it(`controle: ${provedor} com endereço público sai`, async () => {
      const fetch = espiao();
      const model = registry[provedor]!("sk-x", "modelo-x", "https://gateway.exemplo/v1");

      await generateText({ model, prompt: "oi", maxRetries: 0 }).catch(() => undefined);

      expect(fetch).toHaveBeenCalled();
      expect(String(fetch.mock.calls[0]?.[0])).toContain("gateway.exemplo");
    });

    it(`controle: ${provedor} sem endereço próprio vai ao endpoint canônico`, async () => {
      const fetch = espiao();
      const model = registry[provedor]!("sk-x", "modelo-x");

      await generateText({ model, prompt: "oi", maxRetries: 0 }).catch(() => undefined);

      expect(fetch).toHaveBeenCalled();
    });
  }
});

describe("pilha antiga (gateway-binding) — o mesmo endereço, a mesma régua", () => {
  beforeEach(() => {
    h.binding = null;
  });

  for (const provedor of ROTEADORES) {
    it(`${provedor} + loopback: recusa, e nada sai`, async () => {
      h.binding = {
        provider: provedor,
        credential_id: CREDENCIAL,
        model_id: "modelo-x",
        base_url: "http://127.0.0.1:4000/v1",
      };
      const fetch = espiao();
      const r = await resolverModeloDoPonto(
        "sentiment_classify",
        ORG,
        "anthropic/claude-haiku-4-5",
      );
      expect(r?.origem).toBe("binding");

      await expect(
        generateText({ model: r!.model as LanguageModel, prompt: "oi", maxRetries: 0 }),
      ).rejects.toThrow(/unsafe_url:/);
      expect(fetch).not.toHaveBeenCalled();
    });

    it(`controle: ${provedor} com endereço público sai`, async () => {
      h.binding = {
        provider: provedor,
        credential_id: CREDENCIAL,
        model_id: "modelo-x",
        base_url: "https://gateway.exemplo/v1",
      };
      const fetch = espiao();
      const r = await resolverModeloDoPonto(
        "sentiment_classify",
        ORG,
        "anthropic/claude-haiku-4-5",
      );

      await generateText({ model: r!.model as LanguageModel, prompt: "oi", maxRetries: 0 }).catch(
        () => undefined,
      );

      expect(fetch).toHaveBeenCalled();
    });
  }
});

describe("PUT /api/v1/ai/providers — a escrita recusa o endereço interno", () => {
  beforeEach(() => {
    h.escritas.length = 0;
    h.requireRole.mockResolvedValue({
      ok: true,
      user: { id: "u1", is_platform_admin: true, idioma: "pt-BR" },
      org: { orgId: ORG, name: "Org", role: "admin" },
    });
  });

  function put(base_url: string) {
    return new NextRequest("http://localhost/api/v1/ai/providers", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "stage_classifier",
        provider: "openrouter",
        model_id: "modelo-x",
        credential_id: CREDENCIAL,
        base_url,
      }),
    });
  }

  it.each(INTERNOS)("%s: 422 e nada gravado", async (_rotulo, endereco) => {
    const { PUT } = await import("@/app/api/v1/ai/providers/route");

    const res = await PUT(put(endereco));

    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { code: string; details?: { motivo?: string } } };
    expect(corpo.error.code).toBe("base_url_destino_bloqueado");
    expect(corpo.error.details?.motivo).toMatch(/^unsafe_url:/);
    expect(h.escritas).toEqual([]);
  });

  it("controle: endereço público grava", async () => {
    const { PUT } = await import("@/app/api/v1/ai/providers/route");

    const res = await PUT(put("https://gateway.exemplo/v1"));

    expect(res.status).toBe(200);
    expect(h.escritas).toEqual(["upsert:ai_purpose_bindings"]);
  });
});
