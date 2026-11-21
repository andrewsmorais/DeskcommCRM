import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { transportePinterest } from "./pinterest/conversions";
import { cliqueDaPlataforma, clienteParaGuardar } from "./rastreio/clique-da-plataforma";
import { transporteDe } from "./registry";
import { transporteTaboola } from "./taboola/conversions";
import { transporteTiktok, URL_DO_TIKTOK } from "./tiktok/conversions";
import type { ConversaoOffline, CredencialDeConversao } from "./types";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const venda = (extra: Partial<ConversaoOffline> = {}): ConversaoOffline => ({
  organizationId: "org",
  leadId: "lead-1",
  evento: "Purchase",
  eventoId: "lead-1:Purchase",
  ocorridoEm: new Date("2026-11-20T15:00:00Z"),
  cliqueDeOrigem: "CLIQUE123456",
  telefone: "5511987654321",
  valorCentavos: 19990,
  moeda: "brl",
  ...extra,
});

const cred = (extra: Partial<CredencialDeConversao> = {}): CredencialDeConversao => ({
  datasetId: "DESTINO",
  accessToken: "token-secreto-de-teste-0123456789",
  testEventCode: null,
  ...extra,
});

type Chamada = { url: string; init: RequestInit };
function falsoFetch(status: number, corpo: unknown): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), init });
    return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });
  });
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

describe("registro", () => {
  it("as três plataformas novas têm transporte", () => {
    expect(transporteDe("tiktok_ads")?.plataforma).toBe("tiktok_ads");
    expect(transporteDe("pinterest_ads")?.plataforma).toBe("pinterest_ads");
    expect(transporteDe("taboola_ads")?.plataforma).toBe("taboola_ads");
  });
});

describe("TikTok", () => {
  it("manda CompletePayment com ttclid, telefone em SHA-256 com + e o token no cabeçalho", async () => {
    const chamadas = falsoFetch(200, { code: 0, message: "OK" });
    const r = await transporteTiktok.enviar(cred({ datasetId: "C4PIXEL123" }), venda());
    expect(r).toEqual({ tipo: "ok" });
    expect(chamadas[0]!.url).toBe(URL_DO_TIKTOK);
    expect(chamadas[0]!.url).not.toContain("token");
    expect((chamadas[0]!.init.headers as Record<string, string>)["Access-Token"]).toBe(cred().accessToken);
    const corpo = JSON.parse(String(chamadas[0]!.init.body));
    expect(corpo).toMatchObject({ event_source: "web", event_source_id: "C4PIXEL123" });
    expect(corpo.data[0]).toMatchObject({
      event: "CompletePayment",
      event_time: Math.floor(Date.parse("2026-11-20T15:00:00Z") / 1000),
      event_id: "lead-1:Purchase",
      user: { ttclid: "CLIQUE123456", phone: sha("+5511987654321") },
      properties: { value: 199.9, currency: "BRL" },
    });
    expect(corpo.test_event_code).toBeUndefined();
  });

  it("código de teste vai no corpo", async () => {
    const chamadas = falsoFetch(200, { code: 0 });
    await transporteTiktok.enviar(cred({ testEventCode: "TEST999" }), venda());
    expect(JSON.parse(String(chamadas[0]!.init.body)).test_event_code).toBe("TEST999");
  });

  it("HTTP 200 com code diferente de zero é recusa permanente; 5xx tenta de novo", async () => {
    falsoFetch(200, { code: 40001, message: "pixel inválido" });
    expect(await transporteTiktok.enviar(cred(), venda())).toMatchObject({ tipo: "permanente" });
    falsoFetch(503, "fora do ar");
    expect(await transporteTiktok.enviar(cred(), venda())).toMatchObject({ tipo: "transitorio" });
  });

  it("só compra com valor", async () => {
    const chamadas = falsoFetch(200, { code: 0 });
    expect(await transporteTiktok.enviar(cred(), venda({ valorCentavos: null }))).toMatchObject({
      tipo: "permanente",
    });
    expect(chamadas).toHaveLength(0);
  });
});

describe("Pinterest", () => {
  const cliente = { ip: "200.100.50.25", userAgent: "Mozilla/5.0 (iPhone)" };

  it("manda checkout com epik, IP e navegador, valor em texto e Bearer no cabeçalho", async () => {
    const chamadas = falsoFetch(200, { events: [{ status: "processed" }] });
    const r = await transportePinterest.enviar(cred({ datasetId: "549755813599" }), venda({ clienteDoClique: cliente }));
    expect(r).toEqual({ tipo: "ok" });
    expect(chamadas[0]!.url).toBe("https://api.pinterest.com/v5/ad_accounts/549755813599/events");
    expect((chamadas[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${cred().accessToken}`);
    const ev = JSON.parse(String(chamadas[0]!.init.body)).data[0];
    expect(ev).toMatchObject({
      event_name: "checkout",
      action_source: "web",
      event_id: "lead-1:Purchase",
      user_data: {
        click_id: "CLIQUE123456",
        ph: [sha("5511987654321")],
        client_ip_address: cliente.ip,
        client_user_agent: cliente.userAgent,
      },
      custom_data: { currency: "BRL", value: "199.90", order_id: "lead-1" },
    });
  });

  it("modo de teste usa ?test=true", async () => {
    const chamadas = falsoFetch(200, { events: [{ status: "processed" }] });
    await transportePinterest.enviar(cred({ testEventCode: "x" }), venda({ clienteDoClique: cliente }));
    expect(chamadas[0]!.url.endsWith("/events?test=true")).toBe(true);
  });

  it("evento recusado dentro de um 200 é permanente, com a mensagem da plataforma", async () => {
    falsoFetch(200, { events: [{ status: "failed", error_message: "click_id inválido" }] });
    expect(await transportePinterest.enviar(cred(), venda({ clienteDoClique: cliente }))).toEqual({
      tipo: "permanente",
      detalhe: "click_id inválido",
    });
  });

  it("sem IP e navegador do clique a recusa é nossa, sem chamar a API", async () => {
    const chamadas = falsoFetch(200, {});
    expect(await transportePinterest.enviar(cred(), venda())).toMatchObject({ tipo: "permanente" });
    expect(chamadas).toHaveLength(0);
  });
});

describe("Taboola", () => {
  it("postback GET com click-id, nome do evento, valor e moeda — sem token", async () => {
    const chamadas = falsoFetch(200, "");
    const r = await transporteTaboola.enviar(cred({ datasetId: "purchase", accessToken: "" }), venda());
    expect(r).toEqual({ tipo: "ok" });
    const u = new URL(chamadas[0]!.url);
    expect(u.origin + u.pathname).toBe("https://trc.taboola.com/actions-handler/log/3/s2s-action");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      "click-id": "CLIQUE123456",
      name: "purchase",
      revenue: "199.90",
      currency: "BRL",
      orderid: "lead-1:Purchase",
    });
    expect(chamadas[0]!.init.method).toBe("GET");
  });

  it("4xx é permanente; 5xx tenta de novo", async () => {
    falsoFetch(400, "bad click id");
    expect(await transporteTaboola.enviar(cred(), venda())).toMatchObject({ tipo: "permanente" });
    falsoFetch(502, "");
    expect(await transporteTaboola.enviar(cred(), venda())).toMatchObject({ tipo: "transitorio" });
  });
});

describe("código de clique no link rastreável", () => {
  it("reconhece ttclid, epik e tblci", () => {
    expect(cliqueDaPlataforma(new URLSearchParams("ttclid=E.C.P.abc123XYZ"))).toEqual({
      plataforma: "tiktok_ads",
      id: "E.C.P.abc123XYZ",
    });
    expect(cliqueDaPlataforma(new URLSearchParams("epik=dj0yJnU9abc"))?.plataforma).toBe("pinterest_ads");
    expect(cliqueDaPlataforma(new URLSearchParams("tblci=GiA1b2c3d4e5f6"))?.plataforma).toBe("taboola_ads");
    expect(cliqueDaPlataforma(new URLSearchParams("tbl_click_id=GiA1b2c3d4e5f6"))?.plataforma).toBe("taboola_ads");
  });

  it("marcador não trocado ou valor estranho não vira código", () => {
    expect(cliqueDaPlataforma(new URLSearchParams("ttclid=__CLICKID__"))).toBeNull();
    expect(cliqueDaPlataforma(new URLSearchParams("tblci={click_id}"))).toBeNull();
    expect(cliqueDaPlataforma(new URLSearchParams("epik=abc"))).toBeNull();
    expect(cliqueDaPlataforma(new URLSearchParams("utm_source=tiktok"))).toBeNull();
  });

  it("IP e navegador só são guardados para o Pinterest", () => {
    const cliente = { ip: "1.2.3.4", userAgent: "UA" };
    expect(clienteParaGuardar({ plataforma: "pinterest_ads", id: "x" }, cliente)).toEqual({
      ip: "1.2.3.4",
      user_agent: "UA",
    });
    expect(clienteParaGuardar({ plataforma: "tiktok_ads", id: "x" }, cliente)).toBeNull();
    expect(clienteParaGuardar(null, cliente)).toBeNull();
  });
});
