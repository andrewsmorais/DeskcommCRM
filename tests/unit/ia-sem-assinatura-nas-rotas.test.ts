/**
 * SEM ASSINATURA ATIVA, AS ROTAS QUE CHAMAM O MODELO RECUSAM — ANTES de
 * escrever e antes da chamada paga.
 *
 * ═══ O achado ═══
 *
 * `requireRole` só consulta o plano quando recebe `plano`, e as rotas que
 * chamam o modelo pela tela não passavam nenhum: POST draft-reply (`agent`),
 * POST versions/:vid/test (`admin`) e POST cases/:id/chat (`agent`) rodavam o
 * modelo da chave da plataforma para organização cancelada, vencida ou sem
 * plano. Reproduzido pela auditoria: draft-reply → 200 com 1 chamada ao
 * modelo; versions/:vid/test → 200 com 3.
 *
 * A régua é `exigirAssinaturaAtiva` (a mesma decisão do turno do agente:
 * leitura do plano indisponível LIBERA). Dublê só na LEITURA do plano.
 *
 * ═══ Duas camadas de prova ═══
 *
 *   1. Comportamento, nas três rotas do achado: 403 e nenhuma escrita/chamada.
 *      Cada uma tem o seu controle positivo (assinatura ativa passa).
 *   2. Cerca de texto em TODA rota que chama modelo pela tela: a régua aparece
 *      no handler e antes da chamada. É o que pega a oitava rota que nascer
 *      sem ela.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  leituraDoPlano: vi.fn(),
  requireRole: vi.fn(),
  sessao: vi.fn(),
  admin: vi.fn(),
  pool: vi.fn(),
  rascunho: vi.fn(),
  testarVersao: vi.fn(),
  responderSobreOCaso: vi.fn(),
  visiveis: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  getOrganizationBilling: (...args: unknown[]) => m.leituraDoPlano(...args),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: m.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.sessao }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/agent-engine/db/request-pool", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getRequestPool: m.pool,
}));
vi.mock("@/lib/agent-engine/agent/request-deps", () => ({ requestTurnDeps: vi.fn(() => ({})) }));
vi.mock("@/lib/agent-engine/agent/reply-drafts", () => ({ generateReplyDraft: m.rascunho }));
vi.mock("@/lib/agent-engine/agent/sandbox", () => ({ testAgentVersion: m.testarVersao }));
vi.mock("@/lib/agent-engine/agent/conversa-do-caso", () => ({
  responderSobreOCaso: m.responderSobreOCaso,
}));
vi.mock("@/lib/escalacao/chamados", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  conversasVisiveisDosCasos: m.visiveis,
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: m.rateLimit }));

const ORG = "13000000-0000-4000-8000-000000000001";
const USER = "13000000-0000-4000-8000-000000000002";
const CONVERSA = "13000000-0000-4000-8000-000000000003";
const AGENTE = "13000000-0000-4000-8000-000000000004";
const VERSAO = "13000000-0000-4000-8000-000000000005";
const CASO = "13000000-0000-4000-8000-000000000006";

const VENCIDA = {
  ok: true,
  billing: { is_active: false, plan_slug: "essencial", status: "canceled" },
};
const ATIVA = { ok: true, billing: { is_active: true, plan_slug: "essencial", status: "active" } };

/** Um encadeável de PostgREST que responde `linha` e registra as escritas. */
function cliente(linha: Record<string, unknown> | null, escritas: string[] = []) {
  return {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "is", "order", "limit"]) q[metodo] = () => q;
      q.insert = () => {
        escritas.push(`insert:${tabela}`);
        return q;
      };
      q.update = () => {
        escritas.push(`update:${tabela}`);
        return q;
      };
      q.maybeSingle = async () => ({ data: linha, error: null });
      q.single = async () => ({ data: { id: "run-1" }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return q;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXIGIR_ASSINATURA", "true");
  m.requireRole.mockResolvedValue({
    ok: true,
    user: { id: USER, is_platform_admin: false, idioma: "pt-BR" },
    org: { orgId: ORG, name: "Org", role: "admin" },
  });
  m.rascunho.mockResolvedValue({ id: "rascunho-1", status: "pending", original_body: "Oi!" });
  m.testarVersao.mockResolvedValue({ candidates: [], proposals: [], impediments: [] });
  m.visiveis.mockResolvedValue([CONVERSA]);
  m.rateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 12 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function post(corpo: unknown): NextRequest {
  return new NextRequest("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function codigo(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { error?: { code?: string } }).error?.code;
}

describe("POST /conversations/:id/draft-reply", () => {
  beforeEach(() => {
    m.sessao.mockResolvedValue(
      cliente({ id: CONVERSA, contact_id: "contato-1", channel_session_id: "canal-1" }),
    );
  });

  it("assinatura vencida: 403 e nenhum rascunho", async () => {
    m.leituraDoPlano.mockResolvedValue(VENCIDA);
    const { POST } = await import("@/app/api/v1/conversations/[id]/draft-reply/route");

    const res = (await POST(post({}), { params: Promise.resolve({ id: CONVERSA }) }))!;

    expect(res.status).toBe(403);
    expect(await codigo(res)).toBe("billing_inactive");
    expect(m.leituraDoPlano).toHaveBeenCalledWith(ORG);
    expect(m.rascunho).not.toHaveBeenCalled();
  });

  it("sem plano nenhum: 403 billing_required", async () => {
    m.leituraDoPlano.mockResolvedValue({ ok: true, billing: null });
    const { POST } = await import("@/app/api/v1/conversations/[id]/draft-reply/route");

    const res = (await POST(post({}), { params: Promise.resolve({ id: CONVERSA }) }))!;

    expect(res.status).toBe(403);
    expect(await codigo(res)).toBe("billing_required");
    expect(m.rascunho).not.toHaveBeenCalled();
  });

  it("controle: assinatura ativa gera o rascunho", async () => {
    m.leituraDoPlano.mockResolvedValue(ATIVA);
    const { POST } = await import("@/app/api/v1/conversations/[id]/draft-reply/route");

    const res = (await POST(post({}), { params: Promise.resolve({ id: CONVERSA }) }))!;

    expect(res.status).toBe(200);
    expect(m.rascunho).toHaveBeenCalledTimes(1);
  });

  it("leitura do plano indisponível LIBERA (a regra do turno do agente)", async () => {
    m.leituraDoPlano.mockResolvedValue({ ok: false, reason: "consulta_indisponivel" });
    const { POST } = await import("@/app/api/v1/conversations/[id]/draft-reply/route");

    const res = (await POST(post({}), { params: Promise.resolve({ id: CONVERSA }) }))!;

    expect(res.status).toBe(200);
    expect(m.rascunho).toHaveBeenCalledTimes(1);
  });
});

describe("POST /ai/agents/:id/versions/:vid/test", () => {
  const escritas: string[] = [];
  beforeEach(() => {
    escritas.length = 0;
    m.admin.mockReturnValue(
      cliente(
        {
          id: VERSAO,
          agent_id: AGENTE,
          organization_id: ORG,
          channel_session_id: null,
        },
        escritas,
      ),
    );
  });

  it("assinatura vencida: 403, sem run aberto e sem chamar o motor", async () => {
    m.leituraDoPlano.mockResolvedValue(VENCIDA);
    const { POST } = await import("@/app/api/v1/ai/agents/[id]/versions/[vid]/test/route");

    const res = await POST(post({ sample_message: "oi" }), {
      params: Promise.resolve({ id: AGENTE, vid: VERSAO }),
    });

    expect(res.status).toBe(403);
    expect(await codigo(res)).toBe("billing_inactive");
    expect(m.testarVersao).not.toHaveBeenCalled();
    expect(escritas).toEqual([]);
  });

  it("controle: assinatura ativa roda o teste", async () => {
    m.leituraDoPlano.mockResolvedValue(ATIVA);
    m.pool.mockReturnValue({});
    const { POST } = await import("@/app/api/v1/ai/agents/[id]/versions/[vid]/test/route");

    const res = await POST(post({ sample_message: "oi" }), {
      params: Promise.resolve({ id: AGENTE, vid: VERSAO }),
    });

    expect(res.status).toBe(200);
    expect(m.testarVersao).toHaveBeenCalledTimes(1);
  });
});

describe("POST /ai/cases/:id/chat", () => {
  beforeEach(() => {
    m.sessao.mockResolvedValue(cliente(null));
  });

  it("assinatura vencida: 403 antes de abrir o banco ou chamar o modelo", async () => {
    m.leituraDoPlano.mockResolvedValue(VENCIDA);
    const { POST } = await import("@/app/api/v1/ai/cases/[id]/chat/route");

    const res = await POST(post({ turn_id: crypto.randomUUID(), pergunta: "o que houve?" }), {
      params: Promise.resolve({ id: CASO }),
    });

    expect(res.status).toBe(403);
    expect(await codigo(res)).toBe("billing_inactive");
    expect(m.pool).not.toHaveBeenCalled();
    expect(m.responderSobreOCaso).not.toHaveBeenCalled();
  });

  it("controle: assinatura ativa passa da régua (e chega ao banco)", async () => {
    m.leituraDoPlano.mockResolvedValue(ATIVA);
    m.pool.mockImplementation(() => {
      throw new Error("sem banco neste teste");
    });
    const { POST } = await import("@/app/api/v1/ai/cases/[id]/chat/route");

    const res = await POST(post({ turn_id: crypto.randomUUID(), pergunta: "o que houve?" }), {
      params: Promise.resolve({ id: CASO }),
    });

    expect(m.pool).toHaveBeenCalled();
    expect(res.status).toBe(503);
  });
});

describe("cerca: toda rota que chama modelo pela tela confere a assinatura antes", () => {
  // [rota, a chamada paga que a régua tem de preceder]
  const ROTAS: Array<[string, string]> = [
    ["app/api/v1/conversations/[id]/draft-reply/route.ts", "generateReplyDraft("],
    ["app/api/v1/ai/agents/[id]/versions/[vid]/test/route.ts", "testAgentVersion("],
    ["app/api/v1/ai/cases/[id]/chat/route.ts", "responderSobreOCaso("],
    ["app/api/v1/proposals/[id]/assistant/route.ts", "gerarMudancas("],
    ["app/api/v1/proposals/[id]/preencher-com-conversa/route.ts", "sugerirValoresDaConversa("],
    ["app/api/v1/settings/proposal-templates/importar/route.ts", "gerarModeloDoTexto("],
    ["app/api/v1/prospecting/agents/chat/route.ts", "chatAboutAgent("],
  ];

  it.each(ROTAS)("%s", (rota, chamadaPaga) => {
    const fonte = readFileSync(join(process.cwd(), rota), "utf8");
    const handler = fonte.slice(fonte.indexOf("export async function POST"));
    const regua = handler.indexOf("exigirAssinaturaAtiva(");
    const chamada = handler.indexOf(`await ${chamadaPaga}`);
    expect(chamada, `a chamada paga sumiu de ${rota} — atualize a cerca`).toBeGreaterThan(-1);
    expect(regua, `${rota} chama o modelo sem conferir a assinatura`).toBeGreaterThan(-1);
    expect(regua).toBeLessThan(chamada);
  });
});
