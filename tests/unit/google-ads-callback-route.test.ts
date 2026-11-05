/**
 * A volta do consentimento do Google Ads — o que prova que o retorno é legítimo.
 *
 * O `state` diz de qual organização é a conexão, e a linha gravada em
 * `ad_platform_connections` guarda o refresh token que lê as campanhas e cria
 * ações de conversão. Quem fabricasse o `state` gravaria a conta de anúncios
 * DELE na organização que escolhesse; e, sem vínculo, o admin de uma
 * organização X fazia OUTRA pessoa aprovar a URL com o `state` de X — o token
 * dela ia para X, quantas vezes ele quisesse.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Antes de qualquer import: `lib/env` valida o ambiente na importação, e o
// módulo de config abaixo o importa.
vi.hoisted(() => {
  process.env.INTERNAL_SECRET = "um-segredo-de-instalacao-bem-comprido";
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.exemplo";
});

import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { assinarVinculo } from "@/lib/auth/vinculo-oauth";
import { CAMINHO_DO_CALLBACK } from "@/lib/plataformas-de-anuncio/google/config";
import {
  emitirEstado,
  NOME_DO_VINCULO_DE_ANUNCIOS,
} from "@/lib/plataformas-de-anuncio/google/estado";

const fake = vi.hoisted(() => ({
  troca: vi.fn(),
  upserts: [] as Record<string, unknown>[],
  /** A tabela de nonces queimados: chave primária = nonce, como no banco. */
  nonces: new Set<string>(),
  linhasDeNonce: [] as Record<string, unknown>[],
  erroForcadoDoNonce: null as { code: string; message: string } | null,
}));

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async () => "\\xcifrado"),
}));
vi.mock("@/lib/plataformas-de-anuncio/google/token", () => ({ trocarCodigoPorToken: fake.troca }));
vi.mock("@/lib/plataformas-de-anuncio/google/config", async (original) => ({
  ...(await original<typeof import("@/lib/plataformas-de-anuncio/google/config")>()),
  configuracaoDoGoogleAds: () => ({ clientId: "id", clientSecret: "s", redirectUri: "r" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        if (tabela !== "calendar_oauth_nonces") throw new Error(`insert inesperado em ${tabela}`);
        if (fake.erroForcadoDoNonce) return { error: fake.erroForcadoDoNonce };
        const nonce = String(linha.nonce);
        if (fake.nonces.has(nonce)) return { error: { code: "23505", message: "duplicate key" } };
        fake.nonces.add(nonce);
        fake.linhasDeNonce.push(linha);
        return { error: null };
      },
      upsert: async (linha: Record<string, unknown>) => {
        fake.upserts.push(linha);
        return { error: null };
      },
    }),
  }),
}));

const ORG = "66666666-6666-4666-8666-666666666666";
const ADMIN = "77777777-7777-4777-8777-777777777777";
/** O Bearer que `autorizaCron` aceita e o agendador externo recebe. */
const BEARER_DO_CRON = "um-segredo-de-instalacao-bem-comprido";
const OK = "https://crm.exemplo/app/settings/conversoes?ok=1";
const RECUSA = "https://crm.exemplo/app/settings/conversoes?erro=estado_invalido";

let contador = 0;

/** O que a ida emite: o `state` e o nonce que o cookie de vínculo assina. */
function ida(segredo = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDeAnuncios)) {
  const nonce = `nonce-ads-${++contador}`;
  const state = emitirEstado(
    { organizationId: ORG, userId: ADMIN, api: "google_ads" },
    { segredo, agora: new Date(), nonce },
  );
  return { state, nonce };
}

function cookieDe(
  nonce: string,
  segredo = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDeAnuncios),
) {
  return assinarVinculo(nonce, segredo);
}

function pedido(state: string, cookie?: string): NextRequest {
  const u = new URL(`https://crm.exemplo${CAMINHO_DO_CALLBACK}`);
  u.searchParams.set("code", "codigo-do-google");
  u.searchParams.set("state", state);
  const req = new NextRequest(u);
  if (cookie !== undefined) req.cookies.set(NOME_DO_VINCULO_DE_ANUNCIOS, cookie);
  return req;
}

async function chamar(req: NextRequest) {
  const { GET } = await import("@/app/api/v1/plataformas-de-anuncio/google/callback/route");
  return GET(req);
}

beforeEach(() => {
  fake.upserts.length = 0;
  fake.linhasDeNonce.length = 0;
  fake.nonces.clear();
  fake.erroForcadoDoNonce = null;
  fake.troca.mockReset();
  fake.troca.mockResolvedValue({ ok: true, token: { refresh_token: "1//refresh" } });
});

describe("GET /api/v1/plataformas-de-anuncio/google/callback", () => {
  it("com o cookie da ida, grava a conexão da organização do state — e queima o nonce com prefixo", async () => {
    const { state, nonce } = ida();
    const res = await chamar(pedido(state, cookieDe(nonce)));
    expect(res.headers.get("location")).toBe(OK);
    expect(fake.upserts).toEqual([
      expect.objectContaining({ organization_id: ORG, updated_by: ADMIN }),
    ]);
    // O prefixo separa este fluxo do da Agenda e da loja na mesma tabela.
    expect(fake.linhasDeNonce).toEqual([
      expect.objectContaining({
        nonce: `google_ads:${nonce}`,
        organization_id: ORG,
        user_id: ADMIN,
      }),
    ]);
  });

  it("toda volta apaga o cookie de vínculo, no path do callback", async () => {
    const { state, nonce } = ida();
    const res = await chamar(pedido(state, cookieDe(nonce)));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${NOME_DO_VINCULO_DE_ANUNCIOS}=;`);
    expect(setCookie).toContain(`Path=${CAMINHO_DO_CALLBACK}`);
    expect(setCookie).toMatch(/Max-Age=0/);
  });

  it("SEM o cookie da ida é recusado — sem trocar código, sem queimar, sem gravar", async () => {
    // É a volta do navegador da vítima: ela aprovou a URL que o admin de outra
    // organização lhe mandou, e o navegador dela nunca passou pela ida.
    const { state } = ida();
    const res = await chamar(pedido(state));
    expect(res.headers.get("location")).toBe(RECUSA);
    expect(fake.troca).not.toHaveBeenCalled();
    expect(fake.linhasDeNonce).toHaveLength(0);
    expect(fake.upserts).toHaveLength(0);
  });

  it("cookie de OUTRO fluxo é recusado com o MESMO destino", async () => {
    const { state } = ida();
    const res = await chamar(pedido(state, cookieDe("nonce-de-outro-navegador")));
    expect(res.headers.get("location")).toBe(RECUSA);
    expect(fake.troca).not.toHaveBeenCalled();
    expect(fake.upserts).toHaveLength(0);
  });

  it("o mesmo state NÃO vale duas vezes — a segunda volta é recusada antes da troca", async () => {
    const { state, nonce } = ida();
    expect((await chamar(pedido(state, cookieDe(nonce)))).headers.get("location")).toBe(OK);
    const segunda = await chamar(pedido(state, cookieDe(nonce)));
    expect(segunda.headers.get("location")).toBe(RECUSA);
    expect(fake.troca).toHaveBeenCalledTimes(1);
    expect(fake.upserts).toHaveLength(1);
  });

  it("nonce indisponível por outro motivo também recusa — falhar fechado", async () => {
    fake.erroForcadoDoNonce = { code: "08006", message: "connection failure" };
    const { state, nonce } = ida();
    const res = await chamar(pedido(state, cookieDe(nonce)));
    expect(res.headers.get("location")).toBe(RECUSA);
    expect(fake.troca).not.toHaveBeenCalled();
    expect(fake.upserts).toHaveLength(0);
  });

  it("state fabricado com o BEARER DO CRON é recusado antes de trocar o código", async () => {
    const { state, nonce } = ida(BEARER_DO_CRON);
    const res = await chamar(pedido(state, cookieDe(nonce, BEARER_DO_CRON)));
    expect(res.headers.get("location")).toBe(RECUSA);
    expect(fake.troca).not.toHaveBeenCalled();
    expect(fake.upserts).toHaveLength(0);
  });
});
