/**
 * Captação: aviso de LOJA vale em todos os planos; o resto, do Impulso.
 *
 * Decisão do dono, 20/11/2026: receber o aviso da Shopify, Yampi, Kiwify… não
 * custa nada, então a recuperação de carrinho e de Pix entra no Essencial. O
 * que pede o recurso `webhooks` (Impulso) é formulário, Zapier e o resto.
 *
 * A rota roda de verdade até o INSERT no arquivo de eventos e para ali: o que
 * importa é que o plano foi perguntado pelo recurso certo, ANTES de gravar.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  gravou: 0,
  perguntado: [] as string[],
  noPlano: new Set<string>(["lojas"]),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "webhook_sources") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            data: {
              id: "fonte-1",
              name: "Loja",
              organization_id: "org-1",
              secret_encrypted: null,
              default_pipeline_id: null,
              default_stage_id: null,
              field_map: {},
              redirect_to: null,
              is_active: true,
            },
            error: null,
          }),
        };
        return q;
      }
      if (tabela === "webhook_events_log") {
        return {
          insert: () => {
            estado.gravou++;
            throw new Error("parou-no-arquivo");
          },
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  }),
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/billing/acesso", () => ({
  verificarRecursoDoPlano: async (_org: string, recurso: string) => {
    estado.perguntado.push(recurso);
    return estado.noPlano.has(recurso)
      ? { ok: true }
      : { ok: false, code: "billing_feature", status: 403, message: "do Impulso" };
  },
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/webhooks/captacao", async (original) => ({
  ...(await original<typeof import("@/lib/webhooks/captacao")>()),
  registrarCaptacao: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/v1/webhooks/in/[token]/route";

const bater = (corpo: Record<string, unknown>, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost/api/v1/webhooks/in/token-da-fonte-1", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ token: "token-da-fonte-1" }) },
  );

beforeEach(() => {
  estado.gravou = 0;
  estado.perguntado = [];
  estado.noPlano = new Set(["lojas"]);
});

describe("captação: o plano é decidido pelo que o aviso é", () => {
  it("Essencial: o checkout da Shopify passa pelo recurso `lojas` e segue", async () => {
    await expect(
      bater(
        { phone: "11999990000", completed_at: null, line_items: [{ title: "Mochila" }] },
        { "x-shopify-topic": "checkouts/create" },
      ),
    ).rejects.toThrow("parou-no-arquivo");
    expect(estado.perguntado).toEqual(["lojas"]);
  });

  it("Essencial: a venda da Kiwify também é `lojas`", async () => {
    await expect(
      bater({
        webhook_event_type: "order_approved",
        order_id: "k1",
        Customer: { full_name: "Zé", mobile: "11999998888" },
      }),
    ).rejects.toThrow("parou-no-arquivo");
    expect(estado.perguntado).toEqual(["lojas"]);
  });

  it("Essencial: formulário comum é `webhooks` — 403 com a frase que explica, e nada gravado", async () => {
    const res = await bater({ nome: "Ana", telefone: "11999990000" });
    expect(res.status).toBe(403);
    expect(estado.perguntado).toEqual(["webhooks"]);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toMatch(/lojas e plataformas de venda/);
    expect(corpo.error.message).toMatch(/Impulso/);
    expect(estado.gravou).toBe(0);
  });

  it("Impulso: formulário comum passa", async () => {
    estado.noPlano = new Set(["lojas", "webhooks"]);
    await expect(bater({ nome: "Ana", telefone: "11999990000" })).rejects.toThrow(
      "parou-no-arquivo",
    );
  });
});
