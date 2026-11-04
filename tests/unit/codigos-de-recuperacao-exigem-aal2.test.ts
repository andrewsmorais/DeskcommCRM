/**
 * Gerar códigos de recuperação exige a sessão ter PROVADO o segundo fator.
 *
 * Os códigos substituem o fator: quem os recebe entra sem o aplicativo. A ação
 * apagava os códigos do dono e emitia 10 novos para uma sessão `aal1` — uma
 * senha roubada virava acesso permanente, sem o celular. O irmão "desligar a
 * verificação" já exigia `aal2`; este teste fixa a mesma régua aqui, e nos dois
 * sentidos: `aal1` (e nível ilegível) recusa SEM tocar na tabela; `aal2` emite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { regenerateRecoveryCodes } from "@/app/actions/settings/regenerateRecoveryCodes";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-request-id": "req-teste" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("o caminho do teste não usa a service role");
  },
}));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
  isServiceRoleConfigured: () => false,
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";

type Nivel = "aal1" | "aal2" | null;

function preparar(nivel: Nivel) {
  const escritas: string[] = [];
  const tabela = {
    delete: () => ({
      eq: async () => {
        escritas.push("delete");
        return { error: null };
      },
    }),
    insert: async () => {
      escritas.push("insert");
      return { error: null };
    },
  };
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn(() => tabela),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
      mfa: {
        listFactors: vi.fn(async () => ({
          data: { totp: [{ id: "f1", status: "verified" }] },
          error: null,
        })),
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: nivel ? { currentLevel: nivel, nextLevel: "aal2" } : null,
          error: nivel ? null : new Error("indisponível"),
        })),
      },
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return escritas;
}

describe("regenerateRecoveryCodes — exige aal2", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sessão aal1 com fator cadastrado: recusa com mfa_required e não apaga nem emite", async () => {
    const escritas = preparar("aal1");
    const r = await regenerateRecoveryCodes();
    expect(r).toEqual({ ok: false, error: "mfa_required" });
    expect(escritas).toEqual([]);
  });

  it("nível ilegível fecha falhando", async () => {
    const escritas = preparar(null);
    const r = await regenerateRecoveryCodes();
    expect(r).toEqual({ ok: false, error: "mfa_required" });
    expect(escritas).toEqual([]);
  });

  it("sessão aal2: apaga os antigos e devolve 10 códigos novos", async () => {
    const escritas = preparar("aal2");
    const r = await regenerateRecoveryCodes();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recovery_codes).toHaveLength(10);
    expect(escritas).toEqual(["delete", "insert"]);
  });
});
