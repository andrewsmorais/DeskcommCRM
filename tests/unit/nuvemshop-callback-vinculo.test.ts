/**
 * A volta da instalação da loja só fecha no navegador que saiu, e uma vez.
 *
 * Sem isto, o admin de uma organização X guardava a URL de consentimento com o
 * `state` de X e fazia o dono de OUTRA loja aprová-la: o token da loja da
 * vítima ia para X, com os webhooks de pedido registrados para X — quantas
 * vezes ele quisesse, porque o nonce não era queimado. Mesmo molde de
 * `agenda-google-callback-route.test.ts`.
 */
import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.exemplo";
});

import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { assinarVinculo } from "@/lib/auth/vinculo-oauth";
import {
  CAMINHO_DO_CALLBACK_DA_LOJA,
  issueState,
  NOME_DO_VINCULO_DA_LOJA,
} from "@/lib/nuvemshop/state";

const fake = vi.hoisted(() => ({
  audit: vi.fn(async () => undefined),
  troca: vi.fn(),
  nonces: new Set<string>(),
  linhasDeNonce: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/audit", () => ({ audit: fake.audit }));
vi.mock("@/lib/impersonate/support", () => ({ supportCallbackWriteAllowed: async () => true }));
vi.mock("@/lib/nuvemshop/config", () => ({
  getConfig: () => ({ appId: "123", clientSecret: "segredo-do-app" }),
  SUBSCRIBED_EVENTS: ["order/created"],
  eventToSlug: () => "order-created",
}));
vi.mock("@/lib/nuvemshop/oauth", () => ({ exchangeCodeForToken: fake.troca }));
vi.mock("@/lib/nuvemshop/api-client", () => ({
  NuvemshopApiClient: class {
    async createWebhook() {
      return { id: 1 };
    }
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: "\\x00", error: null }),
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        if (tabela !== "calendar_oauth_nonces") throw new Error(`insert inesperado em ${tabela}`);
        const nonce = String(linha.nonce);
        if (fake.nonces.has(nonce)) return { error: { code: "23505", message: "duplicate key" } };
        fake.nonces.add(nonce);
        fake.linhasDeNonce.push(linha);
        return { error: null };
      },
      // `integracaoDaLoja`: nenhuma organização tem a loja ainda.
      select: () => {
        const cadeia = {
          eq: () => cadeia,
          neq: () => cadeia,
          limit: async () => ({ data: [], error: null }),
        };
        return cadeia;
      },
      upsert: (linha: Record<string, unknown>) => {
        fake.upserts.push(linha);
        return {
          select: () => ({ single: async () => ({ data: { id: "integ-1" }, error: null }) }),
        };
      },
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

const ORG = "88888888-8888-4888-8888-888888888888";
const ADMIN = "99999999-9999-4999-8999-999999999999";
const SESSAO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OK = "https://crm.exemplo/app/integrations/nuvemshop?ok=1";
const RECUSA = "https://crm.exemplo/app/integrations/nuvemshop?error=invalid_state";

let contador = 0;

function ida() {
  const nonce = `0123abcd${++contador}`;
  return { nonce, state: issueState(ORG, { userId: ADMIN, authSessionId: SESSAO }, nonce) };
}

function cookieDe(nonce: string) {
  return assinarVinculo(nonce, chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDaLoja));
}

function pedido(state: string, cookie?: string): NextRequest {
  const u = new URL(`https://crm.exemplo${CAMINHO_DO_CALLBACK_DA_LOJA}`);
  u.searchParams.set("code", "codigo-da-loja");
  u.searchParams.set("state", state);
  const req = new NextRequest(u);
  if (cookie !== undefined) req.cookies.set(NOME_DO_VINCULO_DA_LOJA, cookie);
  return req;
}

async function chamar(req: NextRequest) {
  const { GET } = await import("@/app/api/v1/integrations/nuvemshop/callback/route");
  return GET(req);
}

beforeEach(() => {
  fake.audit.mockClear();
  fake.nonces.clear();
  fake.linhasDeNonce.length = 0;
  fake.upserts.length = 0;
  fake.troca.mockReset();
  fake.troca.mockResolvedValue({
    ok: true,
    accessToken: "tok",
    storeId: "555",
    scope: "read_orders",
  });
});

describe("GET /api/v1/integrations/nuvemshop/callback — vínculo e uso único", () => {
  it("com o cookie da ida, liga a loja à organização do state e queima o nonce com prefixo", async () => {
    const { state, nonce } = ida();
    const res = await chamar(pedido(state, cookieDe(nonce)));
    expect(res.headers.get("location")).toBe(OK);
    expect(fake.upserts).toEqual([expect.objectContaining({ organization_id: ORG })]);
    expect(fake.linhasDeNonce).toEqual([
      expect.objectContaining({
        nonce: `nuvemshop:${nonce}`,
        organization_id: ORG,
        user_id: ADMIN,
      }),
    ]);
    // E o cookie morre com o fluxo, no path em que nasceu.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${NOME_DO_VINCULO_DA_LOJA}=;`);
    expect(setCookie).toContain(`Path=${CAMINHO_DO_CALLBACK_DA_LOJA}`);
  });

  it("SEM o cookie da ida é recusado — sem trocar código, sem queimar, sem gravar", async () => {
    // A volta do navegador do dono da OUTRA loja, que nunca passou pela ida.
    const { state } = ida();
    const res = await chamar(pedido(state));
    expect(res.headers.get("location")).toBe(RECUSA);
    expect(fake.troca).not.toHaveBeenCalled();
    expect(fake.linhasDeNonce).toHaveLength(0);
    expect(fake.upserts).toHaveLength(0);
    expect(fake.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "nuvemshop.oauth_failed",
        metadata: expect.objectContaining({ reason: "vinculo_ausente_ou_nao_confere" }),
      }),
    );
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
    expect(fake.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "state_reutilizado" }),
      }),
    );
  });

  it("state SEM ator (três segmentos), mesmo bem assinado, é recusado", async () => {
    // O formato antigo não dizia quem pediu: não há de quem queimar o nonce nem
    // a quem atribuir a escrita. Assinado com a chave verdadeira de propósito —
    // a recusa tem de vir do formato, não da assinatura.
    const nonce = "abcdef0123";
    const payload = `${ORG}.${nonce}.${Date.now() + 60_000}`;
    const sig = createHmac("sha256", chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDaLoja))
      .update(payload, "utf8")
      .digest("hex");
    const state = `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
    const res = await chamar(pedido(state, cookieDe(nonce)));
    expect(res.headers.get("location")).toBe(RECUSA);
    expect(fake.troca).not.toHaveBeenCalled();
    expect(fake.upserts).toHaveLength(0);
  });
});
