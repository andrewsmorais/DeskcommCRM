// @vitest-environment node
/**
 * GET /api/v1/prospecting/:id/exportar — a lista da campanha em CSV.
 *
 *   1. Só a lista NÃO abordada sai.
 *   2. É LEITURA: só `select`.
 *   3. A organização vem da SESSÃO: a consulta leva a org da sessão, e campanha
 *      que não é dela é 404.
 *   4. A auditoria leva a CONTAGEM, nunca o conteúdo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn(), requireRole: vi.fn() }));

vi.mock("@/lib/instalacao/disparo-em-massa", () => ({ seDisparoEmMassaDesligado: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.requireRole }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => ({ query: deps.query }) }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));

import { GET } from "./route";

const ORG = "99999999-9999-4999-8999-999999999999";
const CAMPANHA = "22222222-2222-4222-8222-222222222222";

function empresa(name: string, phone: string) {
  return { name, phone, website: null, category: "Serviços", address: "Rua X, 10", emails: [], socials: [] };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireRole.mockResolvedValue({ ok: true, user: { id: "u-1" }, org: { orgId: ORG } });
  deps.query.mockImplementation(async (texto: string) => {
    if (texto.startsWith("select id,name from prospecting_campaigns"))
      return { rows: [{ id: CAMPANHA, name: "Clínicas SP" }] };
    return {
      rows: [
        { status: "queued", attempted_at: null, phone: "+5511988880001", data: empresa("Clínica Nova", "+5511988880001") },
        { status: "sent", attempted_at: "2026-11-12T10:00:00Z", phone: "+5511988880002", data: empresa("Já Abordada", "+5511988880002") },
      ],
    };
  });
});

describe("GET /api/v1/prospecting/:id/exportar", () => {
  it("devolve só quem ainda não recebeu mensagem, como CSV, e audita a contagem", async () => {
    const res = await GET(new Request("http://x"), ctx(CAMPANHA));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/lista-clinicas-sp-\d{4}-\d{2}-\d{2}\.csv/);
    const csv = await res.text();
    expect(csv).toContain("Clínica Nova");
    expect(csv).not.toContain("Já Abordada");
    for (const [texto, params] of deps.query.mock.calls as [string, unknown[]][]) {
      expect(texto.trim().toLowerCase().startsWith("select")).toBe(true);
      expect(params[0]).toBe(ORG);
    }
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prospecting.exported",
        organizationId: ORG,
        metadata: { campaign_id: CAMPANHA, total: 2, nao_abordadas: 1 },
      }),
    );
  });

  it("campanha de outra organização é 404", async () => {
    deps.query.mockResolvedValue({ rows: [] });
    const res = await GET(new Request("http://x"), ctx(CAMPANHA));
    expect(res.status).toBe(404);
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("sem empresa para abordar: 422 com a explicação, sem arquivo", async () => {
    deps.query.mockImplementation(async (texto: string) =>
      texto.startsWith("select id,name")
        ? { rows: [{ id: CAMPANHA, name: "X" }] }
        : { rows: [{ status: "sent", attempted_at: "2026-11-12T10:00:00Z", phone: "+5511988880002", data: empresa("A", "+5511988880002") }] },
    );
    const res = await GET(new Request("http://x"), ctx(CAMPANHA));
    expect(res.status).toBe(422);
  });

  it("id que não é UUID é recusado antes do banco", async () => {
    const res = await GET(new Request("http://x"), ctx("nao-e-uuid"));
    expect(res.status).toBe(400);
    expect(deps.query).not.toHaveBeenCalled();
  });
});
