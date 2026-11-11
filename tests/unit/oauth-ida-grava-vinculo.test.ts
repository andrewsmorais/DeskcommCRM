/**
 * A IDA grava o cookie de vínculo que a volta exige — Google Ads e loja.
 *
 * As voltas recusam sem o cookie (`google-ads-callback-route.test.ts`,
 * `nuvemshop-callback-vinculo.test.ts`). Se a ida não o gravasse, ou o gravasse
 * com `path`/`sameSite` errados, toda conexão legítima passaria a falhar — com a
 * mesma mensagem genérica de um ataque recusado. Este arquivo prende o par.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.exemplo";
});

import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { assinarVinculo, VALIDADE_DO_VINCULO_S } from "@/lib/auth/vinculo-oauth";

const fake = vi.hoisted(() => ({
  jar: { set: vi.fn() },
  redirecionadoPara: "",
}));

const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSAO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async () => ({
    ok: true,
    user: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "admin@exemplo.com" },
    org: { orgId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "admin" },
  })),
}));
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: async () => null,
  supportWriteError: () => null,
  authenticatedSessionId: async () => "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
}));
vi.mock("@/lib/plataformas-de-anuncio/google/config", async (original) => ({
  ...(await original<typeof import("@/lib/plataformas-de-anuncio/google/config")>()),
  configuracaoDoGoogleAds: () => ({ clientId: "id", clientSecret: "s", redirectUri: "r" }),
}));
vi.mock("@/lib/plataformas-de-anuncio/google/oauth", () => ({
  montarUrlDeConsentimento: (_app: unknown, { state }: { state: string }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    is_platform_admin: false,
  }),
  resolveActiveOrg: async () => ({ orgId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "admin" }),
}));
vi.mock("@/lib/nuvemshop/config", () => ({
  getConfig: () => ({ appId: "123", clientSecret: "s" }),
}));
vi.mock("@/lib/nuvemshop/oauth", () => ({
  buildAuthorizeUrl: ({ state }: { state: string }) =>
    `https://www.tiendanube.com/apps/123/authorize?state=${encodeURIComponent(state)}`,
}));
vi.mock("next/headers", () => ({ cookies: async () => fake.jar }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    fake.redirecionadoPara = url;
    throw new Error("NEXT_REDIRECT");
  },
}));

beforeEach(() => {
  fake.jar.set.mockClear();
  fake.redirecionadoPara = "";
});

describe("ida do Google Ads", () => {
  it("grava o vínculo HttpOnly, Lax, no path do callback, assinado sobre o nonce do state", async () => {
    const { GET } = await import("@/app/api/v1/plataformas-de-anuncio/google/connect/route");
    const { verificarEstado, NOME_DO_VINCULO_DE_ANUNCIOS } =
      await import("@/lib/plataformas-de-anuncio/google/estado");
    const { CAMINHO_DO_CALLBACK } = await import("@/lib/plataformas-de-anuncio/google/config");

    const res = await GET(
      new NextRequest(
        "https://crm.exemplo/api/v1/plataformas-de-anuncio/google/connect?api=google_ads",
      ),
    );
    const state = new URL(res.headers.get("location") ?? "").searchParams.get("state") ?? "";
    const estado = verificarEstado(state, {
      segredo: chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDeAnuncios),
      agora: new Date(),
    });
    expect(estado).toMatchObject({ organizationId: ORG, userId: ADMIN });

    const cookie = res.cookies.get(NOME_DO_VINCULO_DE_ANUNCIOS);
    expect(cookie?.value).toBe(
      assinarVinculo(estado!.nonce, chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDeAnuncios)),
    );
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: CAMINHO_DO_CALLBACK,
      maxAge: VALIDADE_DO_VINCULO_S,
    });
  });
});

describe("ida da loja", () => {
  it("grava o vínculo HttpOnly, Lax, no path do callback, assinado sobre o nonce do state", async () => {
    const { connectNuvemshop } = await import("@/app/actions/integrations/connectNuvemshop");
    const { verifyState, NOME_DO_VINCULO_DA_LOJA, CAMINHO_DO_CALLBACK_DA_LOJA } =
      await import("@/lib/nuvemshop/state");

    await expect(connectNuvemshop()).rejects.toThrow("NEXT_REDIRECT");
    const state = new URL(fake.redirecionadoPara).searchParams.get("state") ?? "";
    const verificado = verifyState(state);
    expect(verificado).toMatchObject({ orgId: ORG, userId: ADMIN, authSessionId: SESSAO });

    expect(fake.jar.set).toHaveBeenCalledTimes(1);
    const [nome, valor, opcoes] = fake.jar.set.mock.calls[0]!;
    expect(nome).toBe(NOME_DO_VINCULO_DA_LOJA);
    expect(valor).toBe(
      assinarVinculo(verificado!.nonce, chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDaLoja)),
    );
    expect(opcoes).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: CAMINHO_DO_CALLBACK_DA_LOJA,
      maxAge: VALIDADE_DO_VINCULO_S,
    });
  });
});
