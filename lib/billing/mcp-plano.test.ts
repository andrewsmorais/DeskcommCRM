import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registrarFalhaDeToken, tokenFailureLimited } from "@/lib/auth/rate-limit";
import { verificarRecursoDoPlano } from "@/lib/billing/acesso";
import { McpAuthError, validateBearerToken } from "@/lib/mcp/auth";

const banco = vi.hoisted(() => ({
  criar: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eqConsulta: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  eqUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: banco.criar }));
vi.mock("@/lib/billing/acesso", () => ({ verificarRecursoDoPlano: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  registrarFalhaDeToken: vi.fn(),
  tokenFailureLimited: vi.fn(),
}));

const TOKEN = "dsk_teste_ficticio_do_plano";
const TOKEN_ID = "10000000-0000-4000-8000-000000000001";
const ORG_ID = "20000000-0000-4000-8000-000000000002";
const CRIADOR_ID = "30000000-0000-4000-8000-000000000003";
const RUN_ID = "40000000-0000-4000-8000-000000000004";

function tokenComScopes(scopes: string[]) {
  banco.maybeSingle.mockResolvedValue({
    data: {
      id: TOKEN_ID,
      organization_id: ORG_ID,
      scopes,
      revoked_at: null,
      expires_at: null,
      created_by: CRIADOR_ID,
    },
    error: null,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(tokenFailureLimited).mockResolvedValue(false);
  vi.mocked(registrarFalhaDeToken).mockResolvedValue(undefined);
  vi.mocked(verificarRecursoDoPlano).mockResolvedValue({ ok: true });
  banco.criar.mockReturnValue({ from: banco.from });
  banco.from.mockReturnValue({ select: banco.select, update: banco.update });
  banco.select.mockReturnValue({ eq: banco.eqConsulta });
  banco.eqConsulta.mockReturnValue({ maybeSingle: banco.maybeSingle });
  banco.update.mockReturnValue({ eq: banco.eqUpdate });
  banco.eqUpdate.mockResolvedValue({ error: null });
  tokenComScopes(["mcp:read", "mcp:write"]);
});

const ATORES = [
  { nome: "integração externa", scopes: ["mcp:read", "mcp:write"] },
  {
    nome: "bearer com marca de agente IA",
    scopes: ["mcp:write", "role:ai_operator", "actor:ai_agent"],
  },
];

describe("benefício API no bearer MCP", () => {
  it.each(ATORES)("$nome recebe 403 quando o plano não permite API", async ({ scopes }) => {
    tokenComScopes(scopes);
    vi.mocked(verificarRecursoDoPlano).mockResolvedValueOnce({
      ok: false,
      status: 403,
      code: "billing_feature",
      message: "API está disponível a partir do plano Impulso.",
    });

    await expect(validateBearerToken(`Bearer ${TOKEN}`)).rejects.toMatchObject({
      name: "McpAuthError",
      mcpCode: -32002,
      httpStatus: 403,
      message: "API está disponível a partir do plano Impulso.",
    });
    expect(verificarRecursoDoPlano).toHaveBeenCalledExactlyOnceWith(ORG_ID, "api");
    // Um plano insuficiente não significa que a credencial apresentada é inválida.
    expect(registrarFalhaDeToken).not.toHaveBeenCalled();
  });

  it.each(ATORES)("$nome recebe 503 se o plano não pode ser confirmado", async ({ scopes }) => {
    tokenComScopes(scopes);
    vi.mocked(verificarRecursoDoPlano).mockResolvedValueOnce({
      ok: false,
      status: 503,
      code: "billing_unavailable",
      message: "Não foi possível confirmar o plano. Tente novamente em instantes.",
    });

    const erro: unknown = await validateBearerToken(`Bearer ${TOKEN}`).catch(
      (causa: unknown) => causa,
    );

    expect(erro).toBeInstanceOf(McpAuthError);
    expect(erro).toMatchObject({
      mcpCode: -32002,
      httpStatus: 503,
      message: "Não foi possível confirmar o plano. Tente novamente em instantes.",
    });
    expect(verificarRecursoDoPlano).toHaveBeenCalledExactlyOnceWith(ORG_ID, "api");
    expect(registrarFalhaDeToken).not.toHaveBeenCalled();
  });

  it("plano permitido conserva papel, run e scopes do bearer de IA", async () => {
    const scopes = [
      "mcp:read",
      "mcp:write",
      "role:ai_operator",
      "actor:ai_agent",
      `agent_run:${RUN_ID}`,
    ];
    tokenComScopes(scopes);

    const autenticado = await validateBearerToken(`Bearer ${TOKEN}`);

    expect(verificarRecursoDoPlano).toHaveBeenCalledExactlyOnceWith(ORG_ID, "api");
    expect(autenticado).toEqual({
      organizationId: ORG_ID,
      role: "ai_operator",
      actor: { type: "ai_agent", id: RUN_ID, role: "ai_operator", api_token_id: TOKEN_ID },
      apiTokenId: TOKEN_ID,
      scopes,
    });
    expect(banco.from).toHaveBeenCalledWith("api_tokens");
    expect(banco.eqConsulta).toHaveBeenCalledExactlyOnceWith(
      "token_hash",
      `\\x${createHash("sha256").update(TOKEN).digest("hex")}`,
    );
    expect(tokenFailureLimited).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(registrarFalhaDeToken).not.toHaveBeenCalled();
  });

  it("plano permitido mantém o ator de integração externa", async () => {
    const autenticado = await validateBearerToken(`Bearer ${TOKEN}`);

    expect(verificarRecursoDoPlano).toHaveBeenCalledExactlyOnceWith(ORG_ID, "api");
    expect(autenticado.actor).toEqual({ type: "api_token", id: TOKEN_ID, role: "agent" });
    expect(autenticado.scopes).toEqual(["mcp:read", "mcp:write"]);
  });

  it("recusa token revogado antes de consultar benefício do plano", async () => {
    banco.maybeSingle.mockResolvedValueOnce({
      data: {
        id: TOKEN_ID,
        organization_id: ORG_ID,
        scopes: ["mcp:write", "actor:ai_agent"],
        revoked_at: "2020-01-01T00:00:00.000Z",
        expires_at: null,
        created_by: CRIADOR_ID,
      },
      error: null,
    });

    await expect(validateBearerToken(`Bearer ${TOKEN}`)).rejects.toMatchObject({
      mcpCode: -32001,
      httpStatus: 401,
    });
    expect(verificarRecursoDoPlano).not.toHaveBeenCalled();
    expect(registrarFalhaDeToken).toHaveBeenCalledExactlyOnceWith(TOKEN, { contaNoIp: false });
  });
});
