/**
 * O tronco do cadastro de um número: o PRÓPRIO da organização, quando ativo;
 * senão o da INSTALAÇÃO, só quando liberado (lib/voip/tronco-da-instalacao.ts).
 * Sem isso, numa instalação com várias empresas, a primeira a cadastrar o
 * número do servidor passava a receber as ligações dele — e a empresa com
 * tronco próprio não conseguia cadastrar o seu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "22222222-2222-4222-8222-222222222222";
const insert = vi.fn();
const liberado = vi.fn<() => Promise<boolean>>();
let tronco: { endpoint_name: string; is_active: boolean } | null = null;
let agente: { id: string } | null = null;

function consulta(dado: () => unknown) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: dado(), error: null }),
  };
  return q;
}

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "11111111-1111-4111-8111-111111111111" },
    org: { orgId: ORG },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/voip/tronco-da-instalacao", () => ({ troncoDaInstalacaoLiberado: () => liberado() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      if (tabela === "voip_trunk_settings") return consulta(() => tronco);
      if (tabela === "ai_agents") return consulta(() => agente);
      throw new Error(`a sessão não grava ${tabela}`);
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (linha: unknown) => {
        insert(linha);
        return {
          select: () => ({
            single: async () => ({ data: { id: "33333333-3333-4333-8333-333333333333" }, error: null }),
          }),
        };
      },
    }),
  }),
}));

function pedido(corpo: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/v1/phone-numbers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ number: "+551130000000", ...corpo }),
  });
}

describe("POST /api/v1/phone-numbers — tronco do cadastro", () => {
  const antes = process.env.VOIP_TRUNK_ENDPOINT;
  beforeEach(() => {
    process.env.VOIP_TRUNK_ENDPOINT = "PJSIP/trunk-endpoint";
    insert.mockReset();
    liberado.mockReset();
    tronco = null;
    agente = null;
  });
  afterEach(() => {
    if (antes === undefined) delete process.env.VOIP_TRUNK_ENDPOINT;
    else process.env.VOIP_TRUNK_ENDPOINT = antes;
  });

  it("sem tronco próprio e com o da instalação não liberado: 422 e nada gravado", async () => {
    liberado.mockResolvedValue(false);
    const { POST } = await import("./route");
    const res = await POST(pedido() as never);
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("tronco_nao_compartilhado");
    expect(insert).not.toHaveBeenCalled();
  });

  it("com tronco próprio ativo: grava no tronco da organização, mesmo sem o da instalação liberado", async () => {
    liberado.mockResolvedValue(false);
    tronco = { endpoint_name: `org-${ORG}-trunk-endpoint`, is_active: true };
    const { POST } = await import("./route");
    const res = await POST(pedido() as never);
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: ORG, trunk_endpoint: `PJSIP/org-${ORG}-trunk-endpoint` }),
    );
  });

  it("CONTROLE: sem tronco próprio e com o da instalação liberado, grava no da instalação", async () => {
    liberado.mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(pedido() as never);
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trunk_endpoint: "PJSIP/trunk-endpoint" }));
  });

  it("agente padrão de outra organização: 422 e nada gravado", async () => {
    liberado.mockResolvedValue(true);
    agente = null;
    const { POST } = await import("./route");
    const res = await POST(pedido({ default_ai_agent_id: "44444444-4444-4444-8444-444444444444" }) as never);
    expect(res.status).toBe(422);
    expect(insert).not.toHaveBeenCalled();
  });
});
