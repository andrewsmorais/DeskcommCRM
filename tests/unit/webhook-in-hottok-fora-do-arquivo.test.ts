/**
 * O hottok da Hotmart NÃO vai para `webhook_events_log.headers`.
 *
 * A Hotmart se prova pelo cabeçalho `X-HOTMART-HOTTOK`, que é o próprio
 * segredo da fonte de captação. A rota de captação copiava todo cabeçalho
 * (menos authorization/cookie) para o arquivo de eventos — que qualquer membro
 * da organização lê pela RLS, até o leitor. Com o segredo e o path token da
 * mesma linha, o leitor forjava venda "autêntica" da Hotmart.
 *
 * O teste roda a rota de verdade até o INSERT no arquivo e para ali: o que
 * importa é o que a linha leva, não o lead que viria depois.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SEGREDO = "HOTTOK-da-conta-0123456789";

const estado = vi.hoisted(() => ({ linhas: [] as Array<Record<string, unknown>> }));

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
              name: "Hotmart",
              organization_id: "org-1",
              secret_encrypted: "\\xcifrado",
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
          insert: (linha: Record<string, unknown>) => {
            estado.linhas.push(linha);
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
vi.mock("@/lib/billing/acesso", () => ({ exigirRecursoDoPlano: async () => null }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/webhooks/captacao", async (original) => ({
  ...(await original<typeof import("@/lib/webhooks/captacao")>()),
  registrarCaptacao: vi.fn(async () => undefined),
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async () => SEGREDO,
}));

import { POST } from "@/app/api/v1/webhooks/in/[token]/route";

const COMPRA = {
  event: "PURCHASE_APPROVED",
  version: "2.0.0",
  data: {
    buyer: { name: "Fulana", email: "fulana@example.com", checkout_phone: "85999991111" },
    product: { id: 1, name: "Curso" },
    purchase: { transaction: "HP123", status: "APPROVED" },
  },
};

async function bater(headers: Record<string, string>) {
  const req = new NextRequest("http://localhost/api/v1/webhooks/in/token-da-fonte-1", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(COMPRA),
  });
  await expect(
    POST(req, { params: Promise.resolve({ token: "token-da-fonte-1" }) }),
  ).rejects.toThrow("parou-no-arquivo");
  expect(estado.linhas).toHaveLength(1);
  return estado.linhas[0]!.headers as Record<string, string>;
}

describe("captação: cabeçalho de prova fora do arquivo de eventos", () => {
  beforeEach(() => {
    estado.linhas = [];
  });

  it("o hottok autêntico chega, é aceito e NÃO é gravado", async () => {
    const headers = await bater({ "x-hotmart-hottok": SEGREDO, "x-outro": "fica" });
    expect(JSON.stringify(headers)).not.toContain(SEGREDO);
    expect(headers["x-hotmart-hottok"]).toBe("[removido]");
    expect(headers["x-outro"]).toBe("fica");
  });

  it("cabeçalho qualquer que carregue o segredo da fonte também sai", async () => {
    const headers = await bater({
      "x-hotmart-hottok": SEGREDO,
      "x-repasse": `Bearer ${SEGREDO}`,
    });
    expect(JSON.stringify(headers)).not.toContain(SEGREDO);
    expect(headers["x-repasse"]).toBe("[removido]");
  });
});
