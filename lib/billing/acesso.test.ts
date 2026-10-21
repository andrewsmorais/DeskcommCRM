import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ ler: vi.fn() }));
vi.mock("@/lib/billing", () => ({ getOrganizationBilling: mock.ler }));
import { exigirRecursoDoPlano, verificarRecursoDoPlano } from "./acesso";
import { RECURSOS_DO_PLANO, planoInclui, type RecursoDoPlano } from "./catalogo";

beforeEach(() => vi.clearAllMocks());
describe("o plano selecionado autoriza a mesma capacidade no CRM e no runtime", () => {
  for (const plano of ["essencial", "impulso", "escala"]) {
    for (const [recurso, oferta] of Object.entries(RECURSOS_DO_PLANO)) {
      it(`${plano}: ${recurso}`, async () => {
        mock.ler.mockResolvedValue({ ok: true, billing: { plan_slug: plano, is_active: true } });
        const res = await verificarRecursoDoPlano("org-confiavel", recurso as RecursoDoPlano);
        const esperado = plano === "escala" || (plano === "impulso" && oferta.desde === "impulso");
        expect(res.ok).toBe(esperado);
        expect(planoInclui(plano, recurso as RecursoDoPlano)).toBe(esperado);
        expect(mock.ler).toHaveBeenCalledWith("org-confiavel");
      });
    }
  }
  it.each(["pending", "past_due", "suspended", "canceled", "trial-expirado"])(
    "%s não libera efeito premium mesmo com Escala",
    async () => {
      mock.ler.mockResolvedValue({ ok: true, billing: { plan_slug: "escala", is_active: false } });
      expect(await verificarRecursoDoPlano("org", "campanhas")).toMatchObject({
        ok: false,
        code: "billing_inactive",
        status: 403,
      });
    },
  );
  it("não confunde indisponibilidade com ausência de plano", async () => {
    mock.ler.mockResolvedValue({ ok: false, reason: "consulta_indisponivel" });
    const response = await exigirRecursoDoPlano("org", "api", { requestId: "teste" });
    expect(response?.status).toBe(503);
    expect((await response!.json()).error.code).toBe("billing_unavailable");
    mock.ler.mockResolvedValue({ ok: true, billing: null });
    expect(await verificarRecursoDoPlano("org", "api")).toMatchObject({
      ok: false,
      code: "billing_required",
      status: 403,
    });
  });
  it("slug inesperado nunca recebe os privilégios do Escala", () => {
    expect(planoInclui("__proto__", "api")).toBe(false);
    expect(planoInclui("administrador", "api")).toBe(false);
  });
});
