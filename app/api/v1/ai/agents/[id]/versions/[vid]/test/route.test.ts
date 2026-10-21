/**
 * Runtime real do "Testar agente" (issue #71).
 *
 * O preview usa o mesmo core e as mesmas dependências de um turno normal. Este
 * teste fixa o contrato de falha desse caminho: o run guarda um checkpoint
 * útil e a pessoa recebe orientação legível, sem detalhes internos do provider.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { testAgentVersion } from "@/lib/agent-engine/agent/sandbox";
import { requestTurnDeps } from "@/lib/agent-engine/agent/request-deps";
import { getRequestPool, RequestPoolNotConfiguredError } from "@/lib/agent-engine/db/request-pool";
import type * as RequestPoolReal from "@/lib/agent-engine/db/request-pool";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/agent-engine/agent/sandbox", () => ({
  testAgentVersion: vi.fn(async () => {
    throw new Error("AI_GATEWAY_API_KEY ausente");
  }),
}));
vi.mock("@/lib/agent-engine/agent/request-deps", () => ({ requestTurnDeps: vi.fn() }));
vi.mock("@/lib/agent-engine/db/request-pool", async (importOriginal) => ({
  ...(await importOriginal<typeof RequestPoolReal>()),
  getRequestPool: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";
const VERSION = "44444444-4444-4444-8444-444444444444";

function stubAdmin(atualizacoes: Record<string, unknown>[], erroFechamento: string | null = null) {
  return {
    from: (table: string) => {
      if (table === "ai_agent_versions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: VERSION,
                      agent_id: AGENT,
                      organization_id: ORG,
                      system_prompt: "oi",
                      provider: "anthropic",
                      model: "claude-sonnet-4-6",
                      channel_session_id: null,
                      max_steps: 3,
                      token_budget: 1000,
                      cost_budget_cents: 100,
                      tool_ids: [],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      // ai_agent_runs
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }),
        }),
        update: (payload: Record<string, unknown>) => {
          atualizacoes.push(payload);
          const chain = {
            eq: () => chain,
            then: (ok: (value: { error: { message: string } | null }) => unknown) =>
              Promise.resolve({ error: erroFechamento ? { message: erroFechamento } : null }).then(
                ok,
              ),
          };
          return chain;
        },
      };
    },
  };
}

describe("POST .../versions/:vid/test — core compartilhado", () => {
  const atualizacoes: Record<string, unknown>[] = [];
  const requestPool = { query: vi.fn() };
  const turnDeps = {};

  beforeEach(() => {
    vi.clearAllMocks();
    atualizacoes.length = 0;
    vi.mocked(requireSupportWrite).mockResolvedValue(null);
    vi.mocked(testAgentVersion).mockRejectedValue(new Error("AI_GATEWAY_API_KEY ausente"));
    const user: AuthUser = {
      id: USER,
      email: "a@example.com",
      full_name: null,
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR" as const,
      organizations: [{ organization_id: ORG, organization_name: "Org", role: "admin" }],
    };
    vi.mocked(requireRole).mockImplementation(async (min: Role) =>
      ROLE_RANK["admin"] >= ROLE_RANK[min]
        ? { ok: true, user, org: { orgId: ORG, name: "Org", role: "admin" } }
        : ({ ok: false, response: null } as never),
    );
    vi.mocked(createAdminClient).mockReturnValue(stubAdmin(atualizacoes) as never);
    vi.mocked(getRequestPool).mockReturnValue(requestPool as never);
    vi.mocked(requestTurnDeps).mockReturnValue(turnDeps as never);
  });

  async function executar() {
    const { POST } = await import("./route");
    return POST(
      new NextRequest("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sample_message: "oi" }),
      }),
      { params: Promise.resolve({ id: AGENT, vid: VERSION }) },
    );
  }

  it("falha do core vira checkpoint e orientação legível", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sample_message: "oi" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: AGENT, vid: VERSION }) });
    const body = (await res.json()) as { error?: { code?: string; message?: string } };

    expect(testAgentVersion).toHaveBeenCalledWith(
      requestPool,
      turnDeps,
      expect.objectContaining({
        organizationId: ORG,
        agentId: AGENT,
        versionId: VERSION,
        runId: "run-1",
        sampleMessage: "oi",
      }),
    );
    expect(res.status).toBe(422);
    expect(body.error).toMatchObject({
      code: "preview_failed",
      message:
        "Não foi possível executar o teste. Confira modelo, credencial e materiais do agente.",
    });
    expect(body.error?.message).not.toContain("AI_GATEWAY_API_KEY");
    // ⚠️ `failed`, não `"error"`. Este teste cobrava `"error"` — e passava,
    // porque o mock do Supabase não tem o CHECK que o Postgres tem. No banco de
    // verdade o update era rejeitado com 23514 e o erro descartado, então o
    // teste verde e a produção quebrada conviviam. O vocabulário da coluna está
    // agora sob `tests/unit/teste-do-agente-usa-status-que-a-coluna-aceita.test.ts`,
    // que lê o CHECK do `baseline.sql` em vez de confiar num mock.
    expect(atualizacoes).toContainEqual(
      expect.objectContaining({
        status: "failed",
        error_code: "preview_failed",
      }),
    );
  });

  it("conexão ausente retorna 503 acionável e fecha o teste sem chamar o motor", async () => {
    vi.mocked(getRequestPool).mockImplementation(() => {
      throw new RequestPoolNotConfiguredError();
    });
    const res = await executar();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      error: {
        code: "unavailable",
        message: expect.stringContaining("conexão do motor de IA com o banco"),
      },
    });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(testAgentVersion).not.toHaveBeenCalled();
    expect(requestTurnDeps).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(atualizacoes).toEqual([
      expect.objectContaining({
        status: "failed",
        error_code: "request_pool_not_configured",
        completed_at: expect.any(String),
      }),
    ]);
  });

  it("sucesso preserva resposta, fechamento e auditoria", async () => {
    vi.mocked(testAgentVersion).mockResolvedValue({
      candidates: [{ body: "Olá, como posso ajudar?" }],
      proposals: [],
    } as never);
    const res = await executar();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        status: "ok",
        final_text: "Olá, como posso ajudar?",
        run_id: "run-1",
      },
    });
    expect(atualizacoes).toEqual([expect.objectContaining({ status: "completed" })]);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_agent.tested",
        organizationId: ORG,
        actorUserId: USER,
      }),
    );
  });

  it("outro erro do pool continua 422, sem confundir texto com o erro tipado", async () => {
    vi.mocked(getRequestPool).mockImplementation(() => {
      throw new Error("SUPABASE_DB_URL ausente — mensagem de terceiro");
    });
    const res = await executar();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "preview_failed" } });
    expect(testAgentVersion).not.toHaveBeenCalled();
    expect(atualizacoes).toEqual([
      expect.objectContaining({ status: "failed", error_code: "preview_failed" }),
    ]);
  });

  it("recusa de suporte continua antes de qualquer leitura ou execução", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(
      fail("forbidden", "Suporte somente leitura.", 403),
    );
    expect((await executar()).status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(testAgentVersion).not.toHaveBeenCalled();
    expect(getRequestPool).not.toHaveBeenCalled();
  });

  it("recusa de papel continua antes de qualquer leitura ou execução", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "Permissão insuficiente.", 403),
    });
    expect((await executar()).status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(testAgentVersion).not.toHaveBeenCalled();
    expect(getRequestPool).not.toHaveBeenCalled();
  });

  const sentinelas = [
    "sk-proj-SENTINELA_CHAVE_FICTICIA_abcdefgh",
    "tok_SENTINELA_BEARER_abcdefgh",
    "pessoa-sentinela@example.invalid",
    "+55 (11) 98765-4321",
    "123.456.789-09",
    "https://gateway.invalid/v1?token=SENTINELA_QUERY",
    "postgresql://operador:SENTINELA_SENHA@database.invalid:5432/postgres",
  ];
  const erroSensivel = `Falha de teste ${sentinelas[0]} Bearer ${sentinelas[1]} ${sentinelas.slice(2).join(" ")}`;

  it.each(["Error", "texto"])(
    "erro %s redige segredos e dados pessoais antes de gravar ou logar",
    async (tipo) => {
      vi.mocked(testAgentVersion).mockRejectedValue(
        tipo === "Error" ? new Error(erroSensivel) : erroSensivel,
      );
      const res = await executar();
      expect(res.status).toBe(422);
      const registros = JSON.stringify({
        atualizacoes,
        logs: vi.mocked(logger.error).mock.calls,
        resposta: await res.json(),
      });
      for (const sentinela of sentinelas) expect(registros).not.toContain(sentinela);
      expect(registros).not.toContain("SENTINELA_");
      expect(registros).toContain("[CHAVE]");
      expect(registros).toContain("[EMAIL]");
      expect(registros).toContain("[URL]");
      expect(atualizacoes[0]?.error_code).toBe("preview_failed");
      expect(String(atualizacoes[0]?.error_message).length).toBeLessThanOrEqual(500);
    },
  );

  it("falha ao fechar o run também redige o erro do banco antes de logar", async () => {
    vi.mocked(createAdminClient).mockReturnValue(stubAdmin(atualizacoes, erroSensivel) as never);
    vi.mocked(testAgentVersion).mockResolvedValue({ candidates: [], proposals: [] } as never);
    expect((await executar()).status).toBe(200);
    const registros = JSON.stringify(vi.mocked(logger.error).mock.calls);
    for (const sentinela of sentinelas) expect(registros).not.toContain(sentinela);
    expect(registros).not.toContain("SENTINELA_");
    expect(registros).toContain("[CHAVE]");
    expect(registros).toContain("[URL]");
  });
});

// Este teste isola o handler; autoridade de suporte é exercitada na suíte própria.
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: vi.fn(async () => null),
  authenticatedSessionId: vi.fn(async () => "f2200000-0000-4000-8000-000000000099"),
}));
