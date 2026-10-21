import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import type { AuthUser } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { exigirRecursoDoPlano } from "./acesso";

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(),
  mfaEmDivida: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("./acesso", () => ({ exigirRecursoDoPlano: vi.fn() }));

const ORG = "org-da-sessao";
const user: AuthUser = {
  id: "usuario",
  email: "pessoa@teste.local",
  full_name: null,
  avatar_url: null,
  idioma: "pt-BR",
  is_platform_admin: false,
  organizations: [],
};
const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAuthUser).mockResolvedValue(user);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, name: "Empresa", role: "admin" });
  vi.mocked(mfaEmDivida).mockResolvedValue(false);
  rpc.mockResolvedValue({ data: "admin", error: null });
  vi.mocked(createClient).mockResolvedValue({ rpc } as unknown as Awaited<
    ReturnType<typeof createClient>
  >);
  vi.mocked(exigirRecursoDoPlano).mockResolvedValue(null);
});

async function chamadaComEfeito(efeito: () => Promise<string>) {
  const authz = await requireRole("manager", { plano: "campanhas", requestId: "req-plano" });
  return authz.ok ? efeito() : authz.response;
}

describe("autorização comercial conserva sessão, papel e MFA", () => {
  it("sem sessão não consulta plano nem executa efeito", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(null);
    const efeito = vi.fn(async () => "gravado");
    const resultado = await chamadaComEfeito(efeito);
    expect(resultado).toMatchObject({ status: 401 });
    expect(resolveActiveOrg).not.toHaveBeenCalled();
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
    expect(efeito).not.toHaveBeenCalled();
  });

  it("sem organização validada não consulta plano nem executa efeito", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null);
    const efeito = vi.fn(async () => "gravado");
    expect(await chamadaComEfeito(efeito)).toMatchObject({ status: 403 });
    expect(createClient).not.toHaveBeenCalled();
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
    expect(efeito).not.toHaveBeenCalled();
  });

  it("papel efetivo insuficiente vence o snapshot admin e não consulta plano", async () => {
    rpc.mockResolvedValue({ data: "viewer", error: null });
    vi.mocked(mfaEmDivida).mockResolvedValue(true);
    const efeito = vi.fn(async () => "gravado");
    const resultado = await chamadaComEfeito(efeito);
    expect(typeof resultado).not.toBe("string");
    if (typeof resultado !== "string")
      expect((await resultado.json()).error.code).toBe("forbidden_role");
    expect(rpc).toHaveBeenCalledWith("fn_user_role_in_org", { p_org: ORG });
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
    expect(efeito).not.toHaveBeenCalled();
  });

  it("dívida de MFA impede consultar o benefício e executar efeito", async () => {
    vi.mocked(mfaEmDivida).mockResolvedValue(true);
    const efeito = vi.fn(async () => "gravado");
    const resultado = await chamadaComEfeito(efeito);
    if (typeof resultado !== "string")
      expect((await resultado.json()).error.code).toBe("mfa_required");
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
    expect(efeito).not.toHaveBeenCalled();
  });

  it("plano aguarda as duas leituras de autorização antes de liberar efeito", async () => {
    let liberarPapel!: (resultado: { data: string; error: null }) => void;
    let liberarMfa!: (emDivida: boolean) => void;
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          liberarPapel = resolve;
        }),
    );
    vi.mocked(mfaEmDivida).mockImplementation(
      () =>
        new Promise((resolve) => {
          liberarMfa = resolve;
        }),
    );
    const efeito = vi.fn(async () => "gravado");
    const chamada = chamadaComEfeito(efeito);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
    liberarPapel({ data: "manager", error: null });
    await Promise.resolve();
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
    expect(efeito).not.toHaveBeenCalled();
    liberarMfa(false);
    expect(await chamada).toBe("gravado");
    expect(exigirRecursoDoPlano).toHaveBeenCalledWith(ORG, "campanhas", { requestId: "req-plano" });
    expect(efeito).toHaveBeenCalledTimes(1);
  });

  it.each([403, 503])("recusa comercial %s bloqueia o efeito depois dos guards", async (status) => {
    const resposta = fail(
      status === 503 ? "billing_unavailable" : "billing_feature",
      "Confira o plano",
      status,
    );
    vi.mocked(exigirRecursoDoPlano).mockResolvedValue(resposta);
    const efeito = vi.fn(async () => "gravado");
    expect(await chamadaComEfeito(efeito)).toBe(resposta);
    expect(mfaEmDivida).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(efeito).not.toHaveBeenCalled();
  });

  it("falha de consulta do papel não libera um plano que responderia permitido", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Papel indisponível" } });
    const efeito = vi.fn(async () => "gravado");
    expect(await chamadaComEfeito(efeito)).toMatchObject({ status: 500 });
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
    expect(efeito).not.toHaveBeenCalled();
  });

  it("platform admin com bypass de papel ainda precisa do benefício comercial", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue({ ...user, is_platform_admin: true });
    const resposta = fail("billing_feature", "O plano não inclui campanhas", 403);
    vi.mocked(exigirRecursoDoPlano).mockResolvedValue(resposta);
    const resultado = await requireRole("admin", { plano: "campanhas", allowPlatformAdmin: true });
    expect(resultado).toEqual({ ok: false, response: resposta });
    expect(exigirRecursoDoPlano).toHaveBeenCalledWith(ORG, "campanhas", { requestId: undefined });
  });

  it("recurso básico sem opção comercial conserva a autorização existente", async () => {
    expect((await requireRole("manager")).ok).toBe(true);
    expect(exigirRecursoDoPlano).not.toHaveBeenCalled();
  });
});
