/**
 * Venda ganha → TikTok, Pinterest e Taboola pelo MESMO caminho da Meta
 * (`conversaoDeVendaHandler`), a partir do contato que o link rastreável
 * marcou com o código de clique de cada plataforma (migration 0567).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { conversaoDeVendaHandler } from "@/lib/conversoes/envio.handler";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "11111111-1111-1111-1111-111111111111";
const LEAD = "22222222-2222-2222-2222-222222222222";
const CONTATO = "33333333-3333-3333-3333-333333333333";

const upserts: { tabela: string; valores: Record<string, unknown> }[] = [];

function fakeAdmin(tabelas: Record<string, unknown>) {
  return {
    from(tabela: string) {
      const c = {
        select: () => c,
        eq: () => c,
        neq: () => c,
        order: () => c,
        limit: () => c,
        maybeSingle: async () => ({ data: tabelas[tabela] ?? null, error: null }),
        upsert: async (valores: Record<string, unknown>) => {
          upserts.push({ tabela, valores });
          return { error: null };
        },
      };
      return c;
    },
    rpc: async () => ({ data: "token-decifrado-da-plataforma", error: null }),
  };
}

const leadGanho = {
  id: LEAD,
  status: "won",
  value_cents: 199_90,
  currency: "BRL",
  closed_at: new Date().toISOString(),
  contact_id: CONTATO,
};

const evento: EventRow = {
  id: "evt",
  organization_id: ORG,
  event_type: "lead.won",
  entity_kind: "crm_lead",
  entity_id: LEAD,
  payload: {},
  metadata: {},
  consumed_by: [],
  attempts: 0,
  created_at: new Date().toISOString(),
} as EventRow;

beforeEach(() => {
  upserts.length = 0;
  vi.restoreAllMocks();
});

function rodar(contato: unknown, conexao: unknown, resposta: Response) {
  vi.mocked(createAdminClient).mockReturnValue(
    fakeAdmin({ crm_leads: leadGanho, contacts: contato, ad_platform_connections: conexao }) as never,
  );
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta);
  return { fetchSpy, resultado: conversaoDeVendaHandler.handle(evento) };
}

describe("a venda volta para a plataforma do clique", () => {
  it("TikTok: contato marcado com ttclid → CompletePayment no pixel", async () => {
    const { fetchSpy, resultado } = rodar(
      { phone_number: "+55 11 98888-7777", source_metadata: { ad_platform: "tiktok_ads", ad_source_id: "E.C.P.ttclid123" } },
      { dataset_id: "C4PIXEL123", access_token_encrypted: "\\xbeef", test_event_code: null, enabled: true },
      new Response('{"code":0,"message":"OK"}', { status: 200 }),
    );
    const r = await resultado;
    expect(r.status).toBe("ok");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("business-api.tiktok.com");
    expect(JSON.parse(String((init as RequestInit).body)).data[0].user.ttclid).toBe("E.C.P.ttclid123");
    expect(upserts.at(-1)?.valores).toMatchObject({ status: "sent", platform: "tiktok_ads" });
  });

  it("Pinterest: leva o IP e o navegador que o clique deixou no contato", async () => {
    const { fetchSpy, resultado } = rodar(
      {
        phone_number: "5511988887777",
        source_metadata: {
          ad_platform: "pinterest_ads",
          ad_source_id: "dj0yJnU9epik",
          ad_raw: { cliente: { ip: "200.1.2.3", user_agent: "Mozilla/5.0" } },
        },
      },
      { dataset_id: "549755813599", access_token_encrypted: "\\xbeef", test_event_code: null, enabled: true },
      new Response('{"events":[{"status":"processed"}]}', { status: 200 }),
    );
    expect((await resultado).status).toBe("ok");
    const corpo = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(corpo.data[0].user_data).toMatchObject({
      click_id: "dj0yJnU9epik",
      client_ip_address: "200.1.2.3",
      client_user_agent: "Mozilla/5.0",
    });
  });

  it("Taboola: só precisa do nome do evento, sem token", async () => {
    const { fetchSpy, resultado } = rodar(
      { phone_number: null, source_metadata: { ad_platform: "taboola_ads", ad_source_id: "GiA1b2c3d4e5f6" } },
      { dataset_id: "purchase", access_token_encrypted: null, test_event_code: null, enabled: true },
      new Response("", { status: 200 }),
    );
    expect((await resultado).status).toBe("ok");
    const u = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(u.searchParams.get("click-id")).toBe("GiA1b2c3d4e5f6");
    expect(u.searchParams.get("name")).toBe("purchase");
  });

  it("sem conexão cadastrada, fica registrado no livro-razão e nada sai", async () => {
    const { fetchSpy, resultado } = rodar(
      { phone_number: null, source_metadata: { ad_platform: "tiktok_ads", ad_source_id: "E.C.P.ttclid123" } },
      null,
      new Response("", { status: 200 }),
    );
    const r = await resultado;
    expect(r).toMatchObject({ status: "skipped", detail: "sem_conexao" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(upserts.at(-1)?.valores).toMatchObject({ status: "skipped", reason: "sem_conexao" });
  });
});
