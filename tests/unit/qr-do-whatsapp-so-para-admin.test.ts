/**
 * O QR de pareamento do WhatsApp só sai para quem pode conectar o canal.
 *
 * Achado de cobertura da auditoria de 04/11/2026: as duas rotas que fazem proxy
 * do QR do WAHA (`onboarding/whatsapp/qr` e `channel-sessions/[id]/qr`) só
 * pediam login. Quem escaneia o QR primeiro liga o número da empresa ao próprio
 * celular — o mesmo ato que `pairing-code` e o início da conexão reservam a
 * admin com a MFA provada. Medido aqui: papel abaixo de admin recebe a recusa e
 * o WAHA nem é consultado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";

const estado = vi.hoisted(() => ({ papelOk: true, fetches: 0 }));

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async () =>
    estado.papelOk
      ? {
          ok: true,
          user: { id: "u", idioma: "pt-BR" },
          org: { orgId: "11111111-1111-4111-8111-111111111111", role: "admin" },
        }
      : { ok: false, response: fail("forbidden", "Papel insuficiente.", 403) },
  ),
}));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: vi.fn(async () => false) }));
vi.mock("@/lib/channels/onboarding-session", () => ({
  loadOnboardingChannel: vi.fn(async () => ({ waha_session_name: "s1", archived_at: null })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    q.maybeSingle = async () => ({
      data: { waha_session_name: "s1", archived_at: null },
      error: null,
    });
    return { from: () => q };
  }),
}));

beforeEach(() => {
  estado.papelOk = true;
  estado.fetches = 0;
  process.env.WAHA_API_BASE_URL = "http://waha.local";
  process.env.WAHA_API_KEY = "chave-de-teste";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      estado.fetches++;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }),
  );
});

describe("QR de pareamento", () => {
  it("onboarding: abaixo de admin é 403 e o WAHA não é consultado", async () => {
    estado.papelOk = false;
    const { GET } = await import("@/app/api/v1/onboarding/whatsapp/qr/route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect(estado.fetches).toBe(0);
  });

  it("canal específico: abaixo de admin é 403 e o WAHA não é consultado", async () => {
    estado.papelOk = false;
    const { GET } = await import("@/app/api/v1/channel-sessions/[id]/qr/route");
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }),
    });
    expect(res.status).toBe(403);
    expect(estado.fetches).toBe(0);
  });

  it("controle: admin recebe a imagem", async () => {
    const { GET } = await import("@/app/api/v1/onboarding/whatsapp/qr/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(estado.fetches).toBe(1);
  });
});
