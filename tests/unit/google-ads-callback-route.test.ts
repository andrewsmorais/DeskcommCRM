/**
 * A volta do consentimento do Google Ads — o que prova que o retorno é legítimo.
 *
 * O `state` diz de qual organização é a conexão, e a linha gravada em
 * `ad_platform_connections` guarda o refresh token que lê as campanhas e cria
 * ações de conversão. Quem fabricasse o `state` gravaria a conta de anúncios
 * DELE (ou a de quem ele enganou) na organização que escolhesse.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { emitirEstado } from "@/lib/plataformas-de-anuncio/google/estado";

const fake = vi.hoisted(() => ({
  troca: vi.fn(),
  upserts: [] as Record<string, unknown>[],
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
    from: () => ({
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

process.env.INTERNAL_SECRET = BEARER_DO_CRON;
process.env.NEXT_PUBLIC_APP_URL = "https://crm.exemplo";

function pedido(state: string): NextRequest {
  const u = new URL("https://crm.exemplo/api/v1/plataformas-de-anuncio/google/callback");
  u.searchParams.set("code", "codigo-do-google");
  u.searchParams.set("state", state);
  return new NextRequest(u);
}

async function chamar(req: NextRequest) {
  const { GET } = await import("@/app/api/v1/plataformas-de-anuncio/google/callback/route");
  return GET(req);
}

beforeEach(() => {
  fake.upserts.length = 0;
  fake.troca.mockReset();
  fake.troca.mockResolvedValue({ ok: true, token: { refresh_token: "1//refresh" } });
});

describe("GET /api/v1/plataformas-de-anuncio/google/callback", () => {
  it("state assinado com a chave da instalação grava a conexão da organização dele", async () => {
    const state = emitirEstado(
      { organizationId: ORG, userId: ADMIN, api: "google_ads" },
      { segredo: chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDeAnuncios), agora: new Date() },
    );
    const res = await chamar(pedido(state));
    expect(res.headers.get("location")).toBe("https://crm.exemplo/app/settings/conversoes?ok=1");
    expect(fake.upserts).toEqual([
      expect.objectContaining({ organization_id: ORG, updated_by: ADMIN }),
    ]);
  });

  it("state fabricado com o BEARER DO CRON é recusado antes de trocar o código", async () => {
    const forjado = emitirEstado(
      { organizationId: ORG, userId: ADMIN, api: "google_ads" },
      { segredo: BEARER_DO_CRON, agora: new Date() },
    );
    const res = await chamar(pedido(forjado));
    expect(res.headers.get("location")).toBe(
      "https://crm.exemplo/app/settings/conversoes?erro=estado_invalido",
    );
    expect(fake.troca).not.toHaveBeenCalled();
    expect(fake.upserts).toHaveLength(0);
  });
});
