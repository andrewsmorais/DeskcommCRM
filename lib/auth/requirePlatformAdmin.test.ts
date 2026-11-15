import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quem TEM a verificação em duas etapas prova o código antes de entrar no
 * painel da plataforma — mesmo com `mfa_required = false` (o padrão). Antes só
 * a política contava, e a senha sozinha abria `/admin` de quem tinha ligado a
 * verificação por vontade própria.
 */

const estado = vi.hoisted(() => ({
  factors: [] as Array<{ factor_type: string; status: string }>,
  mfaRequired: false,
  aal: "aal1" as string,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", factors: estado.factors } } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: estado.aal } }) },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => ({
              data: { user_id: "u1", scope: "full", mfa_required: estado.mfaRequired, revoked_at: null },
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { requirePlatformAdmin } from "./requirePlatformAdmin";

beforeEach(() => {
  estado.factors = [];
  estado.mfaRequired = false;
  estado.aal = "aal1";
});

describe("requirePlatformAdmin — quem tem fator prova na sessão", () => {
  it("com fator verificado e sessão aal1, vai ao desafio mesmo sem a política exigir", async () => {
    estado.factors = [{ factor_type: "totp", status: "verified" }];
    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/login/mfa?next=/admin");
  });

  it("com fator verificado e sessão aal2, entra", async () => {
    estado.factors = [{ factor_type: "totp", status: "verified" }];
    estado.aal = "aal2";
    await expect(requirePlatformAdmin()).resolves.toMatchObject({ platformAdmin: { scope: "full" } });
  });

  it("sem fator e sem política, segue entrando só com a senha (a verificação é opcional)", async () => {
    estado.factors = [{ factor_type: "totp", status: "unverified" }];
    await expect(requirePlatformAdmin()).resolves.toMatchObject({ platformAdmin: { user_id: "u1" } });
  });

  it("política exigindo continua pedindo o código", async () => {
    estado.mfaRequired = true;
    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/login/mfa?next=/admin");
  });
});
