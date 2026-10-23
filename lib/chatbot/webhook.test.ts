import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { continuarAposWebhook, iniciarFluxo, valorNoCaminho, type ContextoDoTurno } from "./motor";
import { lerConfig, type Grafo } from "./passos";
import { problemasDoGrafo } from "./validar";
import { chamarWebhookDoChatbot, urlComVariaveis, type EnvioDoWebhook } from "./webhook";
import { cifrarSegredosDoGrafo } from "./segredos";

const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle = "proximo") => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  target,
  sourceHandle,
});
const ctx = (mensagem: string | null): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-10-22T13:30:00Z"),
  fuso: "America/Sao_Paulo",
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

const rastreio: Grafo = {
  nodes: [
    no("ini", "inicio_canal"),
    no("hook", "webhook", {
      url: "https://loja.exemplo.com.br/pedidos/{{pedido}}",
      metodo: "GET",
      campos: [{ caminho: "pedido.status", variavel: "status" }],
    }),
    no("ok", "enviar_mensagem", { texto: "Seu pedido está: {{status}} ({{webhook_status}})" }),
    no("erro", "enviar_mensagem", { texto: "Não consegui consultar agora." }),
  ],
  edges: [liga("ini", "hook"), liga("hook", "ok", "proximo"), liga("hook", "erro", "falha")],
};

describe("WebHook no motor", () => {
  it("para no passo e pede a chamada ao executor", () => {
    const r = iniciarFluxo(rastreio, "ini", ctx("oi"));
    expect(r.pendente).toEqual({ tipo: "webhook", no: "hook" });
    expect(r.sessao).toMatchObject({ status: "running", no_atual: "hook" });
  });

  it("2xx: guarda o campo pedido e segue por 'Deu certo'", () => {
    const parado = iniciarFluxo(rastreio, "ini", ctx("oi")).sessao;
    const r = continuarAposWebhook(
      rastreio,
      parado,
      { ok: true, status: 200, corpo: { pedido: { status: "enviado" } } },
      ctx("oi"),
    );
    expect(textos(r.efeitos)).toEqual(["Seu pedido está: enviado (200)"]);
  });

  it("falha: segue por 'Falhou'; sem essa ligação, o fluxo termina sem mensagem vazia", () => {
    const parado = iniciarFluxo(rastreio, "ini", ctx("oi")).sessao;
    expect(textos(continuarAposWebhook(rastreio, parado, { ok: false, status: 500, corpo: null }, ctx(null)).efeitos)).toEqual([
      "Não consegui consultar agora.",
    ]);
    const semFalha: Grafo = { ...rastreio, edges: rastreio.edges.filter((e) => e.sourceHandle !== "falha") };
    const r = continuarAposWebhook(semFalha, parado, { ok: false, status: null, corpo: null }, ctx(null));
    expect(r.efeitos).toEqual([]);
    expect(r.sessao.status).toBe("completed");
  });

  it("'Deu certo' sem ligação nunca cai na ligação de 'Falhou'", () => {
    const g: Grafo = { ...rastreio, edges: rastreio.edges.filter((e) => e.sourceHandle !== "proximo" || e.source !== "hook") };
    const parado = iniciarFluxo(g, "ini", ctx("oi")).sessao;
    expect(textos(continuarAposWebhook(g, parado, { ok: true, status: 200, corpo: {} }, ctx(null)).efeitos)).toEqual([]);
  });

  it("lê caminhos com lista e ignora objeto inteiro", () => {
    const corpo = { itens: [{ nome: "Camiseta" }], total: 99.9, pago: true, cliente: { nome: "Ana" } };
    expect(valorNoCaminho(corpo, "itens.0.nome")).toBe("Camiseta");
    expect(valorNoCaminho(corpo, "total")).toBe("99.9");
    expect(valorNoCaminho(corpo, "pago")).toBe("true");
    expect(valorNoCaminho(corpo, "cliente")).toBeNull();
    expect(valorNoCaminho(corpo, "nao.existe")).toBeNull();
  });

  it("endereço vazio ou sem https impede ligar o fluxo", () => {
    const g = (url: string): Grafo => ({
      nodes: [no("ini", "inicio_canal"), no("h", "webhook", { url })],
      edges: [liga("ini", "h")],
    });
    expect(problemasDoGrafo(g(""))).toContain('escreva o endereço do passo "WebHook".');
    expect(problemasDoGrafo(g("loja.com/api"))).toContain('o endereço do passo "WebHook" precisa começar com https://.');
    expect(problemasDoGrafo(g("https://n8n.exemplo.com/webhook/abc"))).toEqual([]);
  });
});

describe("a chamada", () => {
  const envio: EnvioDoWebhook = {
    fluxoId: "f1",
    passoId: "hook",
    conversationId: "c1",
    contato: { id: "ct1", nome: "Ana", telefone: "+5511999990000", email: null },
    mensagem: "qual o status?",
    respostas: { pedido: "12 34/x" },
  };
  type Chamada = { url: string; init: RequestInit };
  const falso = (status: number, corpo: string, chamadas: Chamada[]) =>
    (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(corpo, { status });
    }) as unknown as typeof fetch;

  it("resposta do contato entra codificada na URL", () => {
    expect(urlComVariaveis("https://x.com/p/{{pedido}}", envio.respostas)).toBe("https://x.com/p/12%2034%2Fx");
  });

  it("POST assinado: corpo é a projeção fixa e a assinatura confere", async () => {
    const chamadas: Chamada[] = [];
    const c = lerConfig("webhook", { url: "https://n8n.exemplo.com/hook", metodo: "POST" });
    const agora = new Date("2026-10-22T13:30:00Z");
    const r = await chamarWebhookDoChatbot(c, envio, { segredo: "s3gr3do", autorizacao: "Bearer abc" }, {
      fetch: falso(200, '{"ok":true}', chamadas),
      agora,
      pularChecagemDeRede: true,
    });
    expect(r).toMatchObject({ ok: true, status: 200, corpo: { ok: true } });
    const h = chamadas[0]!.init.headers as Record<string, string>;
    const corpo = chamadas[0]!.init.body as string;
    expect(JSON.parse(corpo)).toEqual({
      evento: "chatbot.webhook",
      enviado_em: agora.toISOString(),
      fluxo: { id: "f1", passo: "hook" },
      conversa: { id: "c1" },
      contato: envio.contato,
      mensagem: "qual o status?",
      respostas: { pedido: "12 34/x" },
    });
    const ts = h["X-Webhook-Timestamp"];
    const v1 = createHmac("sha256", "s3gr3do").update(`${ts}.${h["X-Webhook-Delivery"]}.${corpo}`).digest("hex");
    expect(h["X-Webhook-Signature"]).toBe(`t=${ts},v1=${v1}`);
    expect(h.Authorization).toBe("Bearer abc");
    expect(chamadas[0]!.init.redirect).toBe("manual");
  });

  it("GET não manda corpo; não-2xx e resposta que não é JSON contam certo", async () => {
    const chamadas: Chamada[] = [];
    const c = lerConfig("webhook", { url: "https://x.com/p/{{pedido}}", metodo: "GET" });
    const r = await chamarWebhookDoChatbot(c, envio, { segredo: null, autorizacao: null }, {
      fetch: falso(404, "não achei", chamadas),
      pularChecagemDeRede: true,
    });
    expect(r).toMatchObject({ ok: false, status: 404, corpo: null, erro: "http_404" });
    expect(chamadas[0]!.init.body).toBeUndefined();
    expect(chamadas[0]!.url).toBe("https://x.com/p/12%2034%2Fx");
  });

  it("endereço interno é recusado antes de qualquer chamada", async () => {
    const chamadas: Chamada[] = [];
    for (const url of ["http://localhost:3000/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "file:///etc/passwd"]) {
      const r = await chamarWebhookDoChatbot(lerConfig("webhook", { url }), envio, { segredo: null, autorizacao: null }, {
        fetch: falso(200, "{}", chamadas),
      });
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/^unsafe_url/);
    }
    expect(chamadas).toHaveLength(0);
  });

  it("rede caída vira 'Falhou', sem exceção", async () => {
    const quebra = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await chamarWebhookDoChatbot(
      lerConfig("webhook", { url: "https://x.com" }),
      envio,
      { segredo: null, autorizacao: null },
      { fetch: quebra, pularChecagemDeRede: true },
    );
    expect(r).toMatchObject({ ok: false, status: null, erro: "rede" });
  });
});

describe("segredos do desenho", () => {
  const admin = {
    rpc: async (_fn: string, args: { plaintext: string }) => ({ data: `\\xenc(${args.plaintext})`, error: null }),
  } as never;
  const semCifra = { rpc: async () => ({ data: null, error: { message: "sem chave" } }) } as never;
  const grafo = (data: Record<string, unknown>): Grafo => ({ nodes: [no("h", "webhook", data)], edges: [] });

  it("troca o texto aberto pela versão cifrada e nunca grava o aberto", async () => {
    const r = await cifrarSegredosDoGrafo(admin, grafo({ url: "https://x.com", segredo: "abc", autorizacao: "Bearer z" }));
    expect(r!.nodes[0]!.data).toEqual({
      url: "https://x.com",
      segredo_enc: "\\xenc(abc)",
      autorizacao_enc: "\\xenc(Bearer z)",
    });
  });

  it("o já cifrado passa direto; vazio remove", async () => {
    const r = await cifrarSegredosDoGrafo(admin, grafo({ segredo_enc: "\\xantigo", autorizacao: "", autorizacao_enc: "" }));
    expect(r!.nodes[0]!.data).toEqual({ segredo_enc: "\\xantigo", autorizacao_enc: null });
  });

  it("sem cifra na instalação, recusa em vez de gravar aberto", async () => {
    expect(await cifrarSegredosDoGrafo(semCifra, grafo({ segredo: "abc" }))).toBeNull();
  });
});
