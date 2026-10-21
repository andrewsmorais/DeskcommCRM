import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/v1/ai/credentials/route";
import { requireRole } from "@/lib/auth/require-role";
import { guardarCredencial } from "@/lib/ai/credenciais/guardar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: vi.fn(async () => null),
}));
vi.mock("@/lib/ai/credenciais/guardar", () => ({ guardarCredencial: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const CRED = "22222222-2222-4222-8222-222222222222";
const CHAVE_FICTICIA = "somente-fixture-openai-1234";
const COLUNAS_LEGADAS = [
  "id",
  "organization_id",
  "provider",
  "label",
  "api_key_last4",
  "validated_at",
  "validation_error",
  "models_available",
  "is_active",
  "created_by",
  "created_at",
  "updated_at",
];
const SEGURA = {
  id: CRED,
  organization_id: ORG,
  provider: "openai",
  label: "OpenAI de teste",
  api_key_last4: "1234",
  validated_at: null,
  validation_error: null,
  models_available: null,
  is_active: true,
  created_by: "actor",
  created_at: "2026-10-17T00:00:00Z",
  updated_at: "2026-10-17T00:00:00Z",
};

/** Reproduz a view que existe no projeto: coluna desconhecida é erro real. */
function bancoSeguro({ falha = false, semLinha = false } = {}) {
  const selects: string[][] = [];
  const filtros: Array<[string, unknown]> = [];
  const tabelas: string[] = [];
  const from = vi.fn((table: string) => {
    tabelas.push(table);
    let colunas: string[] = [];
    function resultado(unica: boolean) {
      if (colunas.some((coluna) => !COLUNAS_LEGADAS.includes(coluna))) {
        return {
          data: null,
          error: { code: "42703", message: "coluna ausente na view segura" },
        };
      }
      if (falha) {
        return {
          data: null,
          error: { code: "08006", message: `erro interno ${CHAVE_FICTICIA}` },
        };
      }
      const escopada = filtros.some(
        ([coluna, valor]) => coluna === "organization_id" && valor === ORG,
      );
      const linhas = semLinha || !escopada ? [] : [SEGURA];
      return { data: unica ? (linhas[0] ?? null) : linhas, error: null };
    }
    const chain = {
      select: vi.fn((columns: string) => {
        colunas = columns.split(",").map((coluna) => coluna.trim());
        selects.push(colunas);
        return chain;
      }),
      eq: vi.fn((coluna: string, valor: unknown) => {
        filtros.push([coluna, valor]);
        return chain;
      }),
      order: vi.fn(async () => resultado(false)),
      single: vi.fn(async () => resultado(true)),
    };
    return chain;
  });
  return { client: { from }, selects, filtros, tabelas };
}

function postar(corpo: Record<string, unknown> = {}) {
  return POST(
    new NextRequest("http://localhost/api/v1/ai/credentials", {
      method: "POST",
      body: JSON.stringify({
        provider: "openai",
        label: "OpenAI de teste",
        api_key: CHAVE_FICTICIA,
        ...corpo,
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("rede proibida neste teste unitário");
    }),
  );
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG, role: "admin", name: "Org de teste" },
    user: { id: "actor", idioma: "pt-BR" },
  } as Awaited<ReturnType<typeof requireRole>>);
  vi.mocked(guardarCredencial).mockResolvedValue({ ok: true, id: CRED, last4: "1234" });
  const banco = bancoSeguro();
  vi.mocked(createClient).mockResolvedValue(banco.client as never);
  vi.mocked(createAdminClient).mockReturnValue(banco.client as never);
});

describe("credenciais nativas na view sem base_url", () => {
  it("GET lista OpenAI usando só as colunas legadas seguras e o filtro da organização", async () => {
    const banco = bancoSeguro();
    vi.mocked(createClient).mockResolvedValue(banco.client as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [SEGURA] });
    expect(banco.selects).toEqual([COLUNAS_LEGADAS]);
    expect(banco.filtros).toContainEqual(["organization_id", ORG]);
    expect(banco.tabelas).toEqual(["ai_provider_credentials_safe"]);
    expect(guardarCredencial).not.toHaveBeenCalled();
  });

  it("POST OpenAI devolve a linha segura confirmada sem exigir uma coluna nova", async () => {
    const banco = bancoSeguro();
    vi.mocked(createAdminClient).mockReturnValue(banco.client as never);

    const res = await postar();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: SEGURA });
    expect(banco.selects).toEqual([COLUNAS_LEGADAS]);
    expect(banco.tabelas).toEqual(["ai_provider_credentials_safe"]);
    expect(guardarCredencial).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: "openai", orgId: ORG, baseUrl: undefined }),
    );
  });

  it("POST cerca a leitura com service role pelo ID criado e pela organização autenticada", async () => {
    const banco = bancoSeguro();
    vi.mocked(createAdminClient).mockReturnValue(banco.client as never);

    await postar();
    expect(banco.filtros).toEqual([
      ["id", CRED],
      ["organization_id", ORG],
    ]);
  });

  it.each([
    ["erro da view", { falha: true }],
    ["zero linhas", { semLinha: true }],
  ])("POST não anuncia sucesso quando o retorno tem %s", async (_caso, cenario) => {
    const banco = bancoSeguro(cenario);
    vi.mocked(createAdminClient).mockReturnValue(banco.client as never);

    const res = await postar();
    expect(res.status).toBe(503);
    const resposta = await res.json();
    expect(resposta.error.code).toBe("internal_error");
    expect(resposta.error.message).toMatch(/pode ter sido salva/i);
    expect(resposta.error.message).toMatch(/confira a lista.*antes de tentar/i);
    expect(resposta).not.toHaveProperty("data");
    expect(JSON.stringify(resposta)).not.toContain(CHAVE_FICTICIA);
    expect(JSON.stringify(resposta)).not.toMatch(/api_key_(encrypted|iv|tag)/);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(guardarCredencial).toHaveBeenCalledTimes(1);
  });

  it("GET não mascara uma falha de banco como lista vazia", async () => {
    const banco = bancoSeguro({ falha: true });
    vi.mocked(createClient).mockResolvedValue(banco.client as never);

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("data");
  });
});

describe("a compatibilidade não muda o endereço de provedor personalizado", () => {
  it("continua recusando personalizado sem endereço antes de guardar qualquer chave", async () => {
    const res = await postar({ provider: "custom" });
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/endereço.*personalizado/i);
    expect(guardarCredencial).not.toHaveBeenCalled();
  });

  it("não aceita injetar endereço em uma credencial OpenAI nativa", async () => {
    const res = await postar({ base_url: "https://gateway.example/v1" });
    expect(res.status).toBe(422);
    expect(guardarCredencial).not.toHaveBeenCalled();
  });

  it("preserva o endereço personalizado e falha se o banco não puder gravá-lo, sem fallback", async () => {
    vi.mocked(guardarCredencial).mockResolvedValue({
      ok: false,
      motivo: "banco",
      detalhe: "base_url não existe",
    });
    const banco = bancoSeguro();
    vi.mocked(createAdminClient).mockReturnValue(banco.client as never);

    const res = await postar({ provider: "custom", base_url: "https://gateway.example/v1/" });
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("data");
    expect(guardarCredencial).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: "custom", baseUrl: "https://gateway.example/v1" }),
    );
    expect(banco.selects).toEqual([]);
  });
});
