/**
 * Webhook da Nuvemshop confere com o segredo da INSTALAÇÃO e recusa loja ambígua.
 *
 * Achados da auditoria de segurança (04/11/2026), os dois medidos aqui na rota
 * real de `store/redact` — a que dispara a anonimização de TODOS os contatos:
 *
 *   1. As rotas conferiam a assinatura contra uma cópia do `client_secret` do
 *      app gravada (cifrada) na linha de cada organização. Um tenant que lia a
 *      sua cópia assinava webhook da loja de OUTRA organização. Agora a
 *      assinatura só confere com o segredo do `.env`; um corpo assinado com
 *      qualquer outro valor é 401.
 *   2. Com a mesma loja em duas organizações, o `.maybeSingle()` virava "loja
 *      de ninguém" (404/200) e a Nuvemshop parava de reenviar. Agora é 500, que
 *      ela reenvia, e nenhum pedido de LGPD nasce para a organização errada.
 */
import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({
  linhas: [] as { id: string; organization_id: string }[],
  pedidos: [] as unknown[],
}));

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/lgpd/repository", () => ({
  createLgpdRequest: vi.fn(async (p: unknown) => {
    estado.pedidos.push(p);
    return { id: "req-1" };
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "tenant_integrations") {
        const q = {
          select: () => q,
          eq: () => q,
          neq: () => q,
          limit: async () => ({ data: estado.linhas, error: null }),
        };
        return q;
      }
      const q2: Record<string, unknown> = {};
      Object.assign(q2, {
        insert: () => q2,
        update: () => q2,
        select: () => q2,
        eq: () => q2,
        single: async () => ({ data: { id: "log-1" }, error: null }),
        then: (ok: (v: unknown) => unknown) => ok({ data: null, error: null }),
      });
      return q2;
    },
    rpc: vi.fn(async () => ({ data: "evt-1", error: null })),
  }),
}));

import { POST } from "@/app/api/v1/webhooks/nuvemshop/store-redact/route";

const SEGREDO_DA_INSTALACAO = "segredo-do-app-no-env";
const ORG_V = "22222222-2222-4222-8222-222222222222";

function pedido(segredo: string) {
  const corpo = JSON.stringify({ store_id: 777001, store_name: "loja" });
  const assinatura = createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");
  return new NextRequest("http://localhost/api/v1/webhooks/nuvemshop/store-redact", {
    method: "POST",
    body: corpo,
    headers: { "content-type": "application/json", "x-linkedstore-hmac-sha256": assinatura },
  });
}

beforeEach(() => {
  process.env.NUVEMSHOP_APP_ID = "app";
  process.env.NUVEMSHOP_CLIENT_ID = "cli";
  process.env.NUVEMSHOP_CLIENT_SECRET = SEGREDO_DA_INSTALACAO;
  estado.linhas = [{ id: "i1", organization_id: ORG_V }];
  estado.pedidos = [];
});

describe("store/redact da Nuvemshop", () => {
  it("assinado com outro segredo (a cópia que estava na linha de um tenant) é 401", async () => {
    const res = await POST(pedido("valor-decifrado-da-linha-de-outro-tenant"));
    expect(res.status).toBe(401);
    expect(estado.pedidos).toEqual([]);
  });

  it("mesma loja em duas organizações: 500 (a Nuvemshop reenvia) e nenhum pedido de LGPD", async () => {
    estado.linhas = [
      { id: "i1", organization_id: ORG_V },
      { id: "i2", organization_id: "33333333-3333-4333-8333-333333333333" },
    ];
    const res = await POST(pedido(SEGREDO_DA_INSTALACAO));
    expect(res.status).toBe(500);
    expect(estado.pedidos).toEqual([]);
  });

  it("controle: assinado com o segredo da instalação, a loja de dono único é atendida", async () => {
    const res = await POST(pedido(SEGREDO_DA_INSTALACAO));
    expect(res.status).toBeLessThan(300);
    expect(estado.pedidos).toHaveLength(1);
    expect(estado.pedidos[0]).toMatchObject({ organizationId: ORG_V });
  });
});
