// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { enviarPushAoUsuario } from "@/lib/notifications/web_push";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/notifications/web_push", () => ({ enviarPushAoUsuario: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("../_membros", () => ({
  membrosDaEquipe: vi.fn(async () => [
    { user_id: EU, nome: "Ana", desde: "2026-01-01T00:00:00Z" },
    { user_id: BIA, nome: "Bia", desde: "2026-01-01T00:00:00Z" },
  ]),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const EU = "11111111-1111-4111-8111-111111111111";
const BIA = "33333333-3333-4333-8333-333333333333";
const ESTRANHO = "44444444-4444-4444-8444-444444444444";

function banco() {
  const inseridas: Record<string, unknown>[] = [];
  const leituras: Record<string, unknown>[] = [];
  const from = vi.fn((tabela: string) => {
    if (tabela === "equipe_leituras")
      return {
        upsert: vi.fn(async (l: Record<string, unknown>) => {
          leituras.push(l);
          return { error: null };
        }),
      };
    expect(tabela).toBe("equipe_mensagens");
    return {
      insert: vi.fn((l: Record<string, unknown>) => {
        inseridas.push(l);
        return {
          select: () => ({
            single: async () => ({ data: { id: "m1", ...l, created_at: "2026-11-13T12:00:00Z" }, error: null }),
          }),
        };
      }),
    };
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { inseridas, leituras };
}

const enviar = (corpo: unknown) =>
  POST(
    new NextRequest("http://localhost/api/v1/equipe/mensagens", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: EU, idioma: "pt-BR" },
    org: { orgId: ORG, name: "Org", role: "viewer" },
  } as never);
});

describe("POST /api/v1/equipe/mensagens", () => {
  it("manda na Geral com a organização da sessão e marca como lida para quem enviou", async () => {
    const { inseridas, leituras } = banco();
    const r = await enviar({ com: "geral", corpo: "  bom dia, equipe  " });
    expect(r.status).toBe(201);
    expect(inseridas[0]).toEqual({ organization_id: ORG, autor_user_id: EU, destinatario_user_id: null, corpo: "bom dia, equipe" });
    expect(leituras[0]).toMatchObject({ organization_id: ORG, user_id: EU, conversa: "geral" });
    expect(enviarPushAoUsuario).not.toHaveBeenCalled();
    const a = vi.mocked(audit).mock.calls[0]![0] as { action: string; metadata: unknown };
    expect(a.action).toBe("team_chat.message_sent");
    expect(JSON.stringify(a)).not.toContain("bom dia");
  });

  it("conversa direta: só com quem é da equipe, e avisa no celular sem o texto", async () => {
    const { inseridas } = banco();
    expect((await enviar({ com: BIA, corpo: "segredo" })).status).toBe(201);
    expect(inseridas[0]).toMatchObject({ destinatario_user_id: BIA });
    const push = vi.mocked(enviarPushAoUsuario).mock.calls[0]!;
    expect(push[1]).toBe(BIA);
    expect(JSON.stringify(push[2])).not.toContain("segredo");

    expect((await enviar({ com: ESTRANHO, corpo: "oi" })).status).toBe(404);
    expect((await enviar({ com: EU, corpo: "oi" })).status).toBe(422);
    expect(inseridas).toHaveLength(1);
  });

  it("recusa mensagem vazia e conversa inválida", async () => {
    banco();
    expect((await enviar({ com: "geral", corpo: "   " })).status).toBe(422);
    expect((await enviar({ com: "todos", corpo: "oi" })).status).toBe(422);
  });
});
