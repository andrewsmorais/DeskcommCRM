// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { PATCH } from "./route";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";

function banco(settings: Record<string, unknown>) {
  const gravado: { valor?: Record<string, unknown>; org?: string } = {};
  const from = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: { settings }, error: null })),
    update: vi.fn((v: { settings: Record<string, unknown> }) => {
      gravado.valor = v.settings;
      return {
        eq: vi.fn(async (_c: string, org: string) => {
          gravado.org = org;
          return { error: null };
        }),
      };
    }),
  }));
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return gravado;
}

const patch = (corpo: unknown) =>
  PATCH(
    new NextRequest("http://localhost/api/v1/settings/variaveis", {
      method: "PATCH",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: ORG, name: "Org", role: "manager" },
  } as never);
});

describe("PATCH /api/v1/settings/variaveis", () => {
  it("troca a lista sem apagar as outras configurações e audita só os nomes", async () => {
    const gravado = banco({ conversas: { assinatura: "sempre" }, variaveis: [{ chave: "pix", valor: "velho" }] });
    const r = await patch({ variaveis: [{ chave: "pix", valor: "novo" }, { chave: "endereco", valor: "Rua X" }] });
    expect(r.status).toBe(200);
    expect(gravado.org).toBe(ORG);
    expect(gravado.valor).toMatchObject({ conversas: { assinatura: "sempre" } });
    expect(gravado.valor?.variaveis).toHaveLength(2);
    const chamada = vi.mocked(audit).mock.calls[0]![0] as { metadata: Record<string, unknown> };
    expect(chamada.metadata).toEqual({ criadas: ["endereco"], removidas: [], alteradas: ["pix"], total: 2 });
    expect(JSON.stringify(chamada)).not.toContain("novo");
  });

  it("recusa nome inválido sem gravar nada", async () => {
    const gravado = banco({});
    const r = await patch({ variaveis: [{ chave: "Meu Pix", valor: "x" }] });
    expect(r.status).toBe(422);
    expect(gravado.valor).toBeUndefined();
  });

  it("só gerente ou acima grava", async () => {
    banco({});
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await patch({ variaveis: [] })).status).toBe(403);
    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe("manager");
  });
});
