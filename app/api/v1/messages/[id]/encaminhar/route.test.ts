import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { POST } from "./route";

/**
 * Encaminhar: origem e destinos pela RLS da sessão; o envio é o da tela, em
 * nome de quem encaminhou; mídia reaproveita o arquivo; apagada não sai.
 */
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const copias: Array<[string, string]> = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: () => ({ copy: async (de: string, para: string) => (copias.push([de, para]), { error: null }) }) },
  })),
}));

const ORG = "60000000-0000-4000-8000-000000000001";
const MSG = "60000000-0000-4000-8000-000000000002";
const C1 = "60000000-0000-4000-8000-000000000003";
const C2 = "60000000-0000-4000-8000-000000000004";
const OCULTA = "60000000-0000-4000-8000-000000000005";

let original: Record<string, unknown> | null;
function cliente() {
  const tabela = (nome: string) => {
    let alvo = "";
    const q = {
      select: () => q,
      eq: (c: string, v: string) => {
        if (c === "id") alvo = v;
        return q;
      },
      maybeSingle: async () =>
        nome === "messages"
          ? { data: original, error: null }
          : { data: alvo === OCULTA ? null : { id: alvo }, error: null },
    };
    return q;
  };
  return { from: tabela };
}
const pedido = (ids: string[]) =>
  new Request(`http://x/api/v1/messages/${MSG}/encaminhar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversation_ids: ids }),
  }) as unknown as NextRequest;
const ctx = { params: Promise.resolve({ id: MSG }) };

beforeEach(() => {
  vi.clearAllMocks();
  original = { id: MSG, type: "text", body: "Seu código é 123", revoked_at: null, conversation_id: "orig" };
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: "u1", idioma: "pt-BR" }, org: { orgId: ORG, role: "agent" } } as never);
  vi.mocked(createClient).mockResolvedValue(cliente() as never);
  vi.mocked(sendMessageHandler).mockResolvedValue({ status: "sending" } as never);
});

describe("encaminhar mensagem", () => {
  it("texto sai para cada conversa escolhida, em nome de quem encaminhou", async () => {
    const r = await POST(pedido([C1, C2]), ctx);
    expect(r.status).toBe(200);
    expect(sendMessageHandler).toHaveBeenCalledTimes(2);
    const [, c, input] = vi.mocked(sendMessageHandler).mock.calls[0]!;
    expect(c).toMatchObject({ organization_id: ORG, actor: { type: "user", id: "u1" } });
    expect(input).toMatchObject({ conversation_id: C1, type: "text", body: "Seu código é 123", metadata: { encaminhada_de: MSG } });
  });

  it("mídia: o arquivo é copiado para a pasta da conversa de destino", async () => {
    copias.length = 0;
    original = { id: MSG, type: "image", body: "foto", media_storage_path: `${ORG}/orig/x.jpg`, media_mime: "image/jpeg", media_size_bytes: 10, revoked_at: null, conversation_id: "orig" };
    await POST(pedido([C1]), ctx);
    expect(copias[0]?.[0]).toBe(`${ORG}/orig/x.jpg`);
    expect(copias[0]?.[1]).toMatch(new RegExp(`^${ORG}/${C1}/.+-x\\.jpg$`));
    expect(vi.mocked(sendMessageHandler).mock.calls[0]![2]).toMatchObject({ type: "image", media_storage_path: copias[0]?.[1] });
  });

  it("arquivo de outra organização não é copiado", async () => {
    copias.length = 0;
    original = { id: MSG, type: "image", body: null, media_storage_path: "outra-org/c/x.jpg", media_mime: "image/jpeg", media_size_bytes: 10, revoked_at: null, conversation_id: "orig" };
    await POST(pedido([C1]), ctx);
    expect(copias).toEqual([]);
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("conversa que a pessoa não enxerga não recebe", async () => {
    const r = await POST(pedido([C1, OCULTA]), ctx);
    const corpo = (await r.json()) as { data: { resultados: { conversation_id: string; ok: boolean }[] } };
    expect(sendMessageHandler).toHaveBeenCalledTimes(1);
    expect(corpo.data.resultados.find((x) => x.conversation_id === OCULTA)?.ok).toBe(false);
  });

  it("mensagem apagada não se encaminha", async () => {
    original = { ...original!, revoked_at: "2026-11-13T10:00:00Z" };
    const r = await POST(pedido([C1]), ctx);
    expect(r.status).toBe(422);
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });
});
