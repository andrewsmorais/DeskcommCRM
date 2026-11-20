/**
 * O link do e-mail de recuperação usa a URL CONFIGURADA, nunca o cabeçalho Origin.
 *
 * O link carrega o token de acesso da pessoa. Montá-lo sobre `Origin` (que é do
 * cliente) deixava quem dispara o pedido escolher para onde o token iria — se o
 * GoTrue aceitasse aquele destino. A auditoria marcou como "precisa conferir"
 * (depende da allow-list do Supabase da VPS); o conserto do lado do app não
 * depende disso: a base é sempre `NEXT_PUBLIC_APP_URL` em produção.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ redirectTo: "" as string }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://atacante.exemplo" }),
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com.br" } }));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
  hashEmail: (e: string) => e,
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  authRateLimited: vi.fn(async () => false),
  AUTH_LIMITS: { reset: {} },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: vi.fn(async (_email: string, opts: { redirectTo: string }) => {
        estado.redirectTo = opts.redirectTo;
        return { error: null };
      }),
    },
  }),
}));

import { requestPasswordReset } from "@/app/actions/auth/requestPasswordReset";

beforeEach(() => {
  estado.redirectTo = "";
});

describe("recuperação de senha — base do link", () => {
  it("ignora o Origin do pedido e usa a URL configurada", async () => {
    await requestPasswordReset({ email: "pessoa@exemplo.com" });
    expect(estado.redirectTo).toBe("https://crm.exemplo.com.br/auth/confirm?type=recovery");
  });
});
