import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  ler: vi.fn(),
  reserva: vi.fn(async (_org: string, _recurso: string, op: () => Promise<unknown>) => op()),
}));
vi.mock("@/lib/billing", () => ({ getOrganizationBilling: m.ler }));
vi.mock("./reserva", () => ({ comReservaDeCota: m.reserva }));
import { comCotaDeEquipe, consultarCotaDaEquipe } from "./equipe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Estes casos medem a camada comercial LIGADA (EXIGIR_ASSINATURA=true, como no
// ChatAI Online). Desligada é o padrão — ver lib/billing/exigencia.ts.
beforeEach(() => {
  vi.stubEnv("EXIGIR_ASSINATURA", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});


function banco(
  membros: { user_id: string; role: string }[] = [],
  convites: string[] = [],
  ativo = false,
  erro = false,
) {
  return {
    from: vi.fn((table: string) => {
      const resposta = {
        data: table === "user_organizations" ? membros : convites.map((email) => ({ email })),
        error: erro ? { code: "rede" } : null,
      };
      const q = {
        select: vi.fn(),
        eq: vi.fn(),
        is: vi.fn(),
        gt: vi.fn(),
        maybeSingle: vi.fn(async () => ({ data: ativo ? { id: "membro" } : null, error: null })),
        then: (resolve: (r: typeof resposta) => unknown) => Promise.resolve(resposta).then(resolve),
      };
      q.select.mockReturnValue(q);
      q.eq.mockReturnValue(q);
      q.is.mockReturnValue(q);
      q.gt.mockReturnValue(q);
      return q;
    }),
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { email: `${id}@example.com` } },
          error: null,
        })),
      },
    },
  } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.ler.mockResolvedValue({ ok: true, billing: { is_active: true, seats: 2 } });
});
describe("vagas de atendentes da assinatura", () => {
  it("reserva vaga para convite válido, deduplica e não conta agente de IA", async () => {
    const db = banco(
      [
        { user_id: "admin", role: "admin" },
        { user_id: "ia", role: "ai_operator" },
      ],
      ["ADMIN@example.com", "novo@example.com", "novo@example.com"],
    );
    const cota = await consultarCotaDaEquipe(db, "org");
    expect(cota.ocupados).toBe(1);
    expect(cota.reservados).toBe(1);
  });
  it("impede ampliar equipe com todas as vagas reservadas antes do efeito", async () => {
    const op = vi.fn();
    await expect(
      comCotaDeEquipe(
        banco([{ user_id: "admin", role: "admin" }], ["novo@example.com"]),
        "org",
        { email: "outro@example.com" },
        op,
      ),
    ).rejects.toMatchObject({ code: "billing_limit", status: 403 });
    expect(op).not.toHaveBeenCalled();
  });
  it("reenvio do mesmo convite não ocupa uma segunda vaga", async () => {
    const op = vi.fn(async () => "reenviado");
    expect(
      await comCotaDeEquipe(
        banco([{ user_id: "admin", role: "admin" }], ["novo@example.com"]),
        "org",
        { email: "NOVO@example.com" },
        op,
      ),
    ).toBe("reenviado");
    expect(m.reserva).toHaveBeenCalledWith("org", "atendentes", expect.any(Function));
  });
  it("aceite da própria reserva ocupa a vaga reservada", async () => {
    const op = vi.fn(async () => "aceito");
    expect(
      await comCotaDeEquipe(
        banco([{ user_id: "admin", role: "admin" }], ["novo@example.com"]),
        "org",
        { userId: "novo", email: "novo@example.com" },
        op,
      ),
    ).toBe("aceito");
  });
  it("replay de membro ativo continua permitido após redução de plano", async () => {
    m.ler.mockResolvedValue({ ok: true, billing: { is_active: false, seats: 1 } });
    const op = vi.fn(async () => "replay");
    expect(await comCotaDeEquipe(banco([], [], true), "org", { userId: "atual" }, op)).toBe(
      "replay",
    );
    expect(m.ler).not.toHaveBeenCalled();
  });
  it("não admite outro membro acima da cota no aceite legado", async () => {
    const db = banco([
      { user_id: "a", role: "admin" },
      { user_id: "b", role: "agent" },
    ]);
    const op = vi.fn();
    await expect(
      comCotaDeEquipe(db, "org", { userId: "c", email: "c@example.com" }, op),
    ).rejects.toMatchObject({ code: "billing_limit" });
    expect(op).not.toHaveBeenCalled();
  });
  it("falha de consulta nunca se transforma em zero membros", async () => {
    await expect(
      comCotaDeEquipe(banco([], [], false, true), "org", { email: "novo@example.com" }, vi.fn()),
    ).rejects.toMatchObject({ code: "billing_unavailable", status: 503 });
  });
  it("assinatura inativa não amplia a equipe", async () => {
    m.ler.mockResolvedValue({ ok: true, billing: { is_active: false, seats: 20 } });
    await expect(
      comCotaDeEquipe(banco(), "org", { email: "novo@example.com" }, vi.fn()),
    ).rejects.toMatchObject({ code: "billing_inactive" });
  });
});
