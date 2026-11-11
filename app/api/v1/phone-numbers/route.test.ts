/**
 * Cadastrar número no tronco da INSTALAÇÃO só quando o tronco está liberado
 * para a organização (lib/voip/tronco-da-instalacao.ts). Sem isso, numa
 * instalação com várias empresas, a primeira a cadastrar o número do servidor
 * passava a receber as ligações dele.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const liberado = vi.fn<() => Promise<boolean>>();

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "11111111-1111-4111-8111-111111111111" },
    org: { orgId: "22222222-2222-4222-8222-222222222222" },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/voip/tronco-da-instalacao", () => ({ troncoDaInstalacaoLiberado: () => liberado() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
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

function pedido() {
  return new Request("http://localhost/api/v1/phone-numbers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ number: "+551130000000" }),
  });
}

describe("POST /api/v1/phone-numbers — tronco da instalação", () => {
  const antes = process.env.VOIP_TRUNK_ENDPOINT;
  beforeEach(() => {
    process.env.VOIP_TRUNK_ENDPOINT = "PJSIP/trunk-endpoint";
    insert.mockReset();
    liberado.mockReset();
  });
  afterEach(() => {
    if (antes === undefined) delete process.env.VOIP_TRUNK_ENDPOINT;
    else process.env.VOIP_TRUNK_ENDPOINT = antes;
  });

  it("tronco não liberado: recusa com 422 e não grava nada", async () => {
    liberado.mockResolvedValue(false);
    const { POST } = await import("./route");
    const res = await POST(pedido() as never);
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("tronco_nao_compartilhado");
    expect(insert).not.toHaveBeenCalled();
  });

  it("CONTROLE: tronco liberado grava o número com o tronco da instalação", async () => {
    liberado.mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(pedido() as never);
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trunk_endpoint: "PJSIP/trunk-endpoint" }));
  });
});
