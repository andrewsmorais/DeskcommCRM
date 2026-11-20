/**
 * NA CHAVE DA PLATAFORMA, PROVEDOR E MODELO SÃO DA PLATAFORMA.
 *
 * ═══ O achado ═══
 *
 * No ChatAI Online a chave de IA é da plataforma, e a trava de
 * `config-tecnica.ts` (só o super-admin escolhe provedor e modelo) valia só
 * para a versão do agente. Pelo painel de Provedores o admin da EMPRESA gravava
 * um binding com `credential_id: null` e qualquer modelo (até fora do catálogo,
 * sem preço — o gasto do mês o conta como zero), ou trocava o padrão da
 * organização; e o motor honrava a escolha na chave da instalação. Reproduzido
 * pela auditoria: `jailbreak_detect` com `gpt-5.4-pro` na chave da plataforma,
 * ~148× o custo do padrão, em toda mensagem recebida.
 *
 * ═══ O que se mede aqui ═══
 *
 *   1. O SEAM (`runModelCall`): binding ou padrão da empresa na chave da
 *      instalação viram o provedor E o modelo da plataforma, resolvidos juntos.
 *      Controles: com a credencial da própria empresa a escolha vale; e a
 *      versão publicada do agente (já travada) não é tocada.
 *   2. A ESCRITA: PUT e PATCH /api/v1/ai/providers recusam com 403 quando quem
 *      escreve não é o super-admin e o ponto rodaria na chave da plataforma.
 *
 * A parte de banco (a policy de escrita de `ai_purpose_bindings` ainda admite
 * o admin da empresa direto pela REST) fica fora deste arquivo — quem fecha a
 * porta do motor é o item 1.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireRole: vi.fn(),
  credencialDaEmpresa: null as { is_active: boolean; validated_at: string | null } | null,
  escritas: [] as string[],
}));

vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: () => Buffer.from(""),
  decryptKey: () => "chave-da-empresa",
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "not", "limit"]) chain[m] = () => chain;
      chain.upsert = () => {
        h.escritas.push(`upsert:${tabela}`);
        return chain;
      };
      chain.maybeSingle = async () => ({
        data:
          tabela === "ai_models"
            ? { model_id: "gpt-5.4-pro", supports_tools: true, supports_vision: false }
            : tabela === "ai_provider_credentials"
              ? h.credencialDaEmpresa && {
                  id: "cred-1",
                  provider: "openai",
                  ...h.credencialDaEmpresa,
                }
              : { id: "binding-1" },
        error: null,
      });
      return chain;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.update = () => {
        h.escritas.push(`update:${tabela}`);
        return chain;
      };
      chain.maybeSingle = async () => ({ data: { settings: {} }, error: null });
      return chain;
    },
  }),
}));

import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";

const ORG = "15000000-0000-4000-8000-000000000001";
const CREDENCIAL = "15000000-0000-4000-8000-000000000002";

/** Banco do seam: o binding do ponto, o padrão da empresa e as chaves dela. */
function poolFalso(opts: {
  binding: { provider: string; model_id: string; credential_id: string | null } | null;
  padrao?: { provider: string; default_model: string | null };
  /** Provedores em que a empresa tem credencial ativa e validada. */
  credenciaisDaEmpresa?: string[];
  /** Modelo padrão do catálogo (`ai_models`) por provedor. */
  catalogo?: Record<string, string>;
}) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("settings->'llm'")) {
      return {
        rows: [
          {
            llm: {
              params: {},
              enabled_models: [],
              ...(opts.padrao ?? { provider: "openai", default_model: null }),
            },
          },
        ],
      };
    }
    if (sql.includes("from ai_purpose_bindings")) {
      return {
        rows: opts.binding
          ? [{ purpose: "jailbreak_detect", base_url: null, is_enabled: true, ...opts.binding }]
          : [],
      };
    }
    if (sql.includes("from ai_provider_credentials")) {
      const temPorId = params[1] === CREDENCIAL && opts.binding?.credential_id === CREDENCIAL;
      const temPorProvedor = (opts.credenciaisDaEmpresa ?? []).includes(String(params[1]));
      return {
        rows:
          temPorId || temPorProvedor
            ? [{ id: CREDENCIAL, api_key_encrypted: "x", api_key_iv: "y", api_key_tag: "z" }]
            : [],
      };
    }
    if (sql.includes("from ai_models")) {
      const padrao = opts.catalogo?.[String(params[0])];
      return { rows: padrao ? [{ model_id: padrao }] : [] };
    }
    if (sql.includes("insert into llm_calls")) return { rows: [{ id: "call-1" }] };
    return { rows: [] };
  });
  return { query } as never;
}

function registrySpiao() {
  const chamadas: Array<{ provider: string; apiKey: string; modelId: string }> = [];
  const fabrica = (provider: string) => (apiKey: string, modelId: string) => {
    chamadas.push({ provider, apiKey, modelId });
    return {
      specificationVersion: "v3",
      provider,
      modelId,
      doGenerate: async () => ({
        content: [{ type: "text", text: "ok" }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }),
    } as never;
  };
  return {
    chamadas,
    registry: {
      anthropic: fabrica("anthropic"),
      openai: fabrica("openai"),
      openrouter: fabrica("openrouter"),
    },
  };
}

const cfg = {
  anthropicApiKey: "chave-anthropic-da-instalacao",
  openaiApiKey: "chave-openai-da-instalacao",
  openrouterApiKey: "chave-openrouter-da-instalacao",
  cacheTtl: "1h" as const,
};

async function chamar(
  pool: never,
  extra: { model?: string; llmOverride?: { provider: string; credentialId: string | null } } = {},
) {
  const { registry, chamadas } = registrySpiao();
  await runModelCall(
    pool,
    cfg,
    {
      tenantId: ORG,
      purpose: extra.llmOverride ? "agent_turn" : "jailbreak_detect",
      messages: [{ role: "user", content: "oi" }],
      ...extra,
    } as never,
    { registry },
  );
  return chamadas;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLATAFORMA_IA_PROVEDOR", "openai");
  vi.stubEnv("PLATAFORMA_IA_MODELO", "gpt-5.4-nano");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seam — a escolha da empresa não roda na chave da plataforma", () => {
  it("binding sem credencial: provedor e modelo da plataforma, na chave da instalação", async () => {
    const chamadas = await chamar(
      poolFalso({ binding: { provider: "openai", model_id: "gpt-5.4-pro", credential_id: null } }),
    );

    expect(chamadas).toEqual([
      { provider: "openai", apiKey: "chave-openai-da-instalacao", modelId: "gpt-5.4-nano" },
    ]);
  });

  it("binding em OUTRO provedor sem credencial: os dois vêm da plataforma, juntos", async () => {
    // Trocar só o id mandaria `gpt-5.4-nano` para a OpenRouter (a lição do #151).
    const chamadas = await chamar(
      poolFalso({ binding: { provider: "openrouter", model_id: "o1-pro", credential_id: null } }),
    );

    expect(chamadas).toEqual([
      { provider: "openai", apiKey: "chave-openai-da-instalacao", modelId: "gpt-5.4-nano" },
    ]);
  });

  it("padrão da empresa sem credencial: também vira o da plataforma", async () => {
    const chamadas = await chamar(
      poolFalso({ binding: null, padrao: { provider: "openai", default_model: "gpt-5.4-pro" } }),
    );

    expect(chamadas).toEqual([
      { provider: "openai", apiKey: "chave-openai-da-instalacao", modelId: "gpt-5.4-nano" },
    ]);
  });

  it("controle: com a credencial da própria empresa, a escolha dela vale", async () => {
    const chamadas = await chamar(
      poolFalso({
        binding: { provider: "openai", model_id: "gpt-5.4-pro", credential_id: CREDENCIAL },
      }),
    );

    expect(chamadas).toEqual([
      { provider: "openai", apiKey: "chave-da-empresa", modelId: "gpt-5.4-pro" },
    ]);
  });

  it("plataforma num provedor sem chave na instalação: padrão do CATÁLOGO no provedor que tem chave, e o aviso nomeia o .env", async () => {
    // A instalação só tem a chave Anthropic e nunca declarou a plataforma (o
    // padrão do código é OpenAI). Recusar faria a atualização exigir edição do
    // `.env`; a escolha da empresa (aqui, o modelo caro) continua descartada —
    // vale o padrão do catálogo da plataforma.
    const { registry, chamadas } = registrySpiao();
    const avisos: string[] = [];
    await runModelCall(
      poolFalso({
        binding: null,
        padrao: { provider: "anthropic", default_model: "claude-opus-5" },
        catalogo: { anthropic: "claude-sonnet-5" },
      }),
      { anthropicApiKey: "chave-anthropic-da-instalacao", cacheTtl: "1h" } as never,
      {
        tenantId: ORG,
        purpose: "jailbreak_detect",
        messages: [{ role: "user", content: "oi" }],
      } as never,
      { registry, log: { warn: (msg: string) => avisos.push(msg), info: () => {} } as never },
    );

    expect(chamadas).toEqual([
      {
        provider: "anthropic",
        apiKey: "chave-anthropic-da-instalacao",
        modelId: "claude-sonnet-5",
      },
    ]);
    expect(avisos.some((a) => a.includes("PLATAFORMA_IA_PROVEDOR"))).toBe(true);
  });

  it("sem padrão no catálogo para o provedor que tem chave: a recusa de antes", async () => {
    const { registry, chamadas } = registrySpiao();
    await expect(
      runModelCall(
        poolFalso({
          binding: null,
          padrao: { provider: "anthropic", default_model: "claude-opus-5" },
        }),
        { anthropicApiKey: "chave-anthropic-da-instalacao", cacheTtl: "1h" } as never,
        {
          tenantId: ORG,
          purpose: "jailbreak_detect",
          messages: [{ role: "user", content: "oi" }],
        } as never,
        { registry },
      ),
    ).rejects.toThrow(/sem credencial LLM/);
    expect(chamadas).toEqual([]);
  });

  it("controle: plataforma declarada igual à chave da instalação segue o padrão da empresa", async () => {
    vi.stubEnv("PLATAFORMA_IA_PROVEDOR", "anthropic");
    vi.stubEnv("PLATAFORMA_IA_MODELO", "claude-sonnet-5");
    const { registry, chamadas } = registrySpiao();
    await runModelCall(
      poolFalso({
        binding: null,
        padrao: { provider: "anthropic", default_model: "claude-sonnet-5" },
      }),
      { anthropicApiKey: "chave-anthropic-da-instalacao", cacheTtl: "1h" } as never,
      {
        tenantId: ORG,
        purpose: "jailbreak_detect",
        messages: [{ role: "user", content: "oi" }],
      } as never,
      { registry },
    );

    expect(chamadas).toEqual([
      {
        provider: "anthropic",
        apiKey: "chave-anthropic-da-instalacao",
        modelId: "claude-sonnet-5",
      },
    ]);
  });

  it("controle: a versão publicada do agente (já travada) não é tocada", async () => {
    const chamadas = await chamar(poolFalso({ binding: null }), {
      model: "gpt-5.4-mini",
      llmOverride: { provider: "openai", credentialId: null },
    });

    expect(chamadas).toEqual([
      { provider: "openai", apiKey: "chave-openai-da-instalacao", modelId: "gpt-5.4-mini" },
    ]);
  });
});

describe("escrita — PUT e PATCH /api/v1/ai/providers", () => {
  function comUsuario(isPlatformAdmin: boolean) {
    h.requireRole.mockResolvedValue({
      ok: true,
      user: { id: "u1", is_platform_admin: isPlatformAdmin, idioma: "pt-BR" },
      org: { orgId: ORG, name: "Org", role: "admin" },
    });
  }
  function pedido(method: "PUT" | "PATCH", corpo: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/v1/ai/providers", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
  }
  const BINDING = { purpose: "jailbreak_detect", provider: "openai", model_id: "gpt-5.4-pro" };

  beforeEach(() => {
    h.escritas.length = 0;
    h.credencialDaEmpresa = null;
  });

  it("PUT do admin da empresa sem credencial: 403 e nada gravado", async () => {
    comUsuario(false);
    const { PUT } = await import("@/app/api/v1/ai/providers/route");

    const res = await PUT(pedido("PUT", { ...BINDING, credential_id: null }));

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "config_tecnica_da_plataforma",
    );
    expect(h.escritas).toEqual([]);
  });

  it("PUT com credencial da empresa que não está validada: 403 (cairia na da plataforma)", async () => {
    comUsuario(false);
    h.credencialDaEmpresa = { is_active: true, validated_at: null };
    const { PUT } = await import("@/app/api/v1/ai/providers/route");

    const res = await PUT(pedido("PUT", { ...BINDING, credential_id: CREDENCIAL }));

    expect(res.status).toBe(403);
    expect(h.escritas).toEqual([]);
  });

  it("controle: PUT com a credencial validada da empresa grava", async () => {
    comUsuario(false);
    h.credencialDaEmpresa = { is_active: true, validated_at: "2026-10-01T00:00:00Z" };
    const { PUT } = await import("@/app/api/v1/ai/providers/route");

    const res = await PUT(pedido("PUT", { ...BINDING, credential_id: CREDENCIAL }));

    expect(res.status).toBe(200);
    expect(h.escritas).toEqual(["upsert:ai_purpose_bindings"]);
  });

  it("controle: o super-admin da plataforma escolhe na chave da plataforma", async () => {
    comUsuario(true);
    const { PUT } = await import("@/app/api/v1/ai/providers/route");

    const res = await PUT(pedido("PUT", { ...BINDING, credential_id: null }));

    expect(res.status).toBe(200);
  });

  it("controle: desligar um ponto continua livre", async () => {
    comUsuario(false);
    const { PUT } = await import("@/app/api/v1/ai/providers/route");

    const res = await PUT(pedido("PUT", { ...BINDING, credential_id: null, is_enabled: false }));

    expect(res.status).toBe(200);
  });

  it("PATCH do padrão pelo admin da empresa sem chave do provedor: 403 e nada gravado", async () => {
    comUsuario(false);
    const { PATCH } = await import("@/app/api/v1/ai/providers/route");

    const res = await PATCH(pedido("PATCH", { provider: "openai", default_model: "gpt-5.4-pro" }));

    expect(res.status).toBe(403);
    expect(h.escritas).toEqual([]);
  });

  it("controle: PATCH com a chave validada da empresa para o provedor grava", async () => {
    comUsuario(false);
    h.credencialDaEmpresa = { is_active: true, validated_at: "2026-10-01T00:00:00Z" };
    const { PATCH } = await import("@/app/api/v1/ai/providers/route");

    const res = await PATCH(pedido("PATCH", { provider: "openai", default_model: "gpt-5.4-pro" }));

    expect(res.status).toBe(200);
    expect(h.escritas).toEqual(["update:organizations"]);
  });
});
