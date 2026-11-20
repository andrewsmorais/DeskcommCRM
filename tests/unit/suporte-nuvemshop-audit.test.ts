import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { assinarVinculo } from "@/lib/auth/vinculo-oauth";
import { issueState, NOME_DO_VINCULO_DA_LOJA } from "@/lib/nuvemshop/state";
const fake = vi.hoisted(() => ({
  audit: vi.fn(),
  allowed: vi.fn(async () => true),
  integration: "fa220000-0000-4000-8000-000000000001",
}));
vi.mock("@/lib/audit", () => ({ audit: fake.audit }));
vi.mock("@/lib/impersonate/support", () => ({ supportCallbackWriteAllowed: fake.allowed }));
vi.mock("@/lib/nuvemshop/config", () => ({
  getConfig: () => ({ clientSecret: "local" }),
  SUBSCRIBED_EVENTS: ["order/created"],
  eventToSlug: () => "order-created",
}));
vi.mock("@/lib/nuvemshop/oauth", () => ({
  exchangeCodeForToken: async () => ({
    ok: true,
    accessToken: "local",
    storeId: "12345",
    scope: "read_orders",
  }),
}));
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
    // insert = queima do nonce; select = `integracaoDaLoja` (nenhuma organização tem a loja).
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => {
        const c = { eq: () => c, neq: () => c, limit: async () => ({ data: [], error: null }) };
        return c;
      },
      upsert: () => ({
        select: () => ({ single: async () => ({ data: { id: fake.integration }, error: null }) }),
      }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));
it("callback sem JWT encaminha identidade do state validado e recurso UUID à auditoria", async () => {
  const actor = randomUUID(),
    session = randomUUID(),
    org = randomUUID();
  const nonce = "0a1b2c3d4e5f";
  const state = issueState(org, { userId: actor, authSessionId: session }, nonce);
  const { GET } = await import("@/app/api/v1/integrations/nuvemshop/callback/route");
  const request = new NextRequest(
    `http://localhost/api/v1/integrations/nuvemshop/callback?code=local&state=${encodeURIComponent(state)}`,
  );
  // O navegador que volta é o que saiu: o cookie de vínculo da ida vai junto.
  request.cookies.set(
    NOME_DO_VINCULO_DA_LOJA,
    assinarVinculo(nonce, chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDaLoja)),
  );
  const response = await GET(request);
  expect(response.status).toBe(307);
  expect(fake.allowed).toHaveBeenCalledWith(org, actor, session);
  expect(fake.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "nuvemshop.connected",
      actorUserId: actor,
      actorAuthSessionId: session,
      organizationId: org,
      resourceId: fake.integration,
    }),
  );
});
