/**
 * Organização suspensa pela plataforma fecha em TODA porta, não só na tela.
 *
 * A suspensão (`organizations.status = 'suspended'`) vivia só no layout de
 * /app: `requireRole`, que guarda as rotas da REST e as actions, e o bearer
 * `dsk_` não olhavam o estado, e quem a plataforma tinha suspendido seguia
 * operando por eles. Fixa: membro de org suspensa recebe 403 `org_suspended`;
 * o admin da plataforma passa (é quem suspende e reativa); org ativa segue igual.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import type { AuthUser } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/server")>();
  return { ...real, loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
  isServiceRoleConfigured: () => false,
  hashEmail: (e: string) => e,
}));

const ORG = "22222222-2222-4222-8222-222222222222";

function preparar(status: string | null, isPlatformAdmin = false): void {
  vi.mocked(loadAuthUser).mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@teste.local",
    is_platform_admin: isPlatformAdmin,
    organizations: [
      {
        organization_id: ORG,
        organization_name: "Org",
        role: "admin",
        organization_status: status,
      },
    ],
  } as unknown as AuthUser);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, name: "Org", role: "admin" });
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn(async () => ({ data: "admin", error: null })),
    auth: {
      mfa: {
        listFactors: vi.fn(async () => ({ data: { totp: [] }, error: null })),
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        })),
      },
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => vi.clearAllMocks());

describe("requireRole — organização suspensa", () => {
  it("membro (mesmo admin) de org suspensa recebe 403 org_suspended", async () => {
    preparar("suspended");
    const r = await requireRole("viewer", { requestId: "r1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const corpo = (await r.response.json()) as { error: { code: string } };
      expect(corpo.error.code).toBe("org_suspended");
    }
  });

  it("admin da plataforma passa — é quem suspende e reativa", async () => {
    preparar("suspended", true);
    expect((await requireRole("admin", { requestId: "r2" })).ok).toBe(true);
  });

  it("org ativa segue igual (controle)", async () => {
    preparar("active");
    expect((await requireRole("admin", { requestId: "r3" })).ok).toBe(true);
  });
});

describe("validateBearerToken — organização suspensa", () => {
  it("token dsk_ de org suspensa é recusado com 403", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "t1",
                  organization_id: ORG,
                  scopes: ["mcp:read"],
                  revoked_at: null,
                  expires_at: null,
                  created_by: "u1",
                  organizations: { status: "suspended" },
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: () => ({ then: () => undefined }) }),
        }),
      }),
    }));
    vi.doMock("@/lib/billing/acesso", () => ({
      verificarRecursoDoPlano: async () => ({ ok: true }),
    }));
    vi.doMock("@/lib/auth/rate-limit", async (orig) => ({
      ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
    }));
    const { validateBearerToken, McpAuthError } = await import("@/lib/mcp/auth");
    const erro = await validateBearerToken(`Bearer dsk_${"a".repeat(40)}`).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(McpAuthError);
    expect((erro as { httpStatus: number }).httpStatus).toBe(403);
    vi.doUnmock("@/lib/supabase/admin");
    vi.doUnmock("@/lib/billing/acesso");
    vi.doUnmock("@/lib/auth/rate-limit");
  });
});
