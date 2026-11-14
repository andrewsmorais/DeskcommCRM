/**
 * Chat no site (migration 0518), com o app de pé: as rotas PÚBLICAS do balão.
 *
 * O que se prova: a mensagem do visitante cai na organização do canal; reenviar
 * não duplica; um visitante NÃO lê a conversa do outro; sem token válido nada
 * volta; a lista de domínios barra site de fora; o canal desligado some; e o
 * limite por visitante responde 429.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chaveDoServidor = process.env.SUPABASE_SERVICE_ROLE_KEY;
const token = () => randomBytes(32).toString("base64url");
const texto = { "Content-Type": "text/plain;charset=UTF-8" };

test.describe("chat no site — rotas públicas", () => {
  test.skip(!url || !chaveDoServidor, "sem o acesso de servidor do banco local");
  const admin = createClient(url ?? "http://x", chaveDoServidor ?? "x", { auth: { persistSession: false } });
  const chave = randomBytes(16).toString("hex");
  let org = "";
  let canal = "";
  const caminho = () => `/api/v1/webhooks/webchat/${chave}`;

  test.beforeAll(async () => {
    const slug = `seg-site-${randomUUID().slice(0, 8)}`;
    const o = await admin.from("organizations").insert({ slug, legal_name: slug, display_name: "Loja do Site" }).select("id").single();
    expect(o.error).toBeNull();
    org = o.data!.id as string;
    const c = await admin
      .from("channel_sessions")
      .insert({
        organization_id: org,
        provider: "webchat",
        webchat_key: chave,
        webhook_path_token: chave,
        webhook_secret_encrypted: "\\x00",
        status: "WORKING",
        display_name: "Site",
        metadata: { webchat: { titulo: "Fale com a loja", cor: "#0f766e" } },
      })
      .select("id")
      .single();
    expect(c.error).toBeNull();
    canal = c.data!.id as string;
  });

  test("a configuração do balão sai sem login e sem dado da empresa", async ({ request }) => {
    const r = await request.get(caminho());
    expect(r.status()).toBe(200);
    expect(r.headers()["access-control-allow-origin"]).toBe("*");
    const corpo = await r.json();
    expect(corpo.data).toMatchObject({ titulo: "Fale com a loja", cor: "#0f766e" });
    expect(JSON.stringify(corpo)).not.toContain(org);
    expect((await request.get(`/api/v1/webhooks/webchat/${"0".repeat(32)}`)).status()).toBe(404);
    expect((await request.get("/api/v1/webhooks/webchat/chave-torta")).status()).toBe(404);
  });

  test("a mensagem cai na empresa do canal, não duplica, e cada visitante lê só a sua", async ({ request }) => {
    const ana = token();
    const beto = token();
    const id = randomUUID();
    const envio = { visitante: ana, id, texto: "Olá, quero um orçamento", nome: "Ana", pagina: "https://loja.exemplo/produto" };
    const r1 = await request.post(`${caminho()}/enviar`, { headers: texto, data: JSON.stringify(envio) });
    expect(r1.status()).toBe(201);
    const r2 = await request.post(`${caminho()}/enviar`, { headers: texto, data: JSON.stringify(envio) });
    expect(r2.status()).toBe(200);
    expect((await r2.json()).data.repetida).toBe(true);
    await request.post(`${caminho()}/enviar`, {
      headers: texto,
      data: JSON.stringify({ visitante: beto, id: randomUUID(), texto: "Sou o Beto" }),
    });

    const conversas = await admin.from("conversations").select("id, channel, organization_id, contact_id").eq("channel_session_id", canal);
    expect(conversas.data).toHaveLength(2);
    for (const c of conversas.data!) expect(c).toMatchObject({ channel: "webchat", organization_id: org });
    const mensagens = await admin.from("messages").select("body").eq("channel_session_id", canal).eq("body", "Olá, quero um orçamento");
    expect(mensagens.data).toHaveLength(1);
    // O token do visitante não está em lugar nenhum do banco.
    const contatos = await admin.from("contacts").select("social_identity").eq("organization_id", org);
    expect(JSON.stringify(contatos.data)).not.toContain(ana);

    const ler = async (visitante: string) =>
      (await (await request.post(`${caminho()}/ler`, { headers: texto, data: JSON.stringify({ visitante }) })).json()).data.mensagens as Array<{ texto: string; de: string }>;
    expect((await ler(ana)).map((m) => m.texto)).toEqual(["Olá, quero um orçamento"]);
    expect((await ler(beto)).map((m) => m.texto)).toEqual(["Sou o Beto"]);
    expect(await ler(token())).toEqual([]);
  });

  test("corpo inválido é recusado sem gravar nada", async ({ request }) => {
    for (const corpo of [
      "{nao é json",
      JSON.stringify({ visitante: "curto", id: randomUUID(), texto: "oi" }),
      JSON.stringify({ visitante: token(), id: "x", texto: "oi" }),
      JSON.stringify({ visitante: token(), id: randomUUID(), texto: "" }),
      JSON.stringify({ visitante: token(), id: randomUUID(), texto: "a".repeat(2001) }),
      JSON.stringify({ visitante: token(), id: randomUUID(), texto: "x".repeat(9000) }),
    ]) {
      const r = await request.post(`${caminho()}/enviar`, { headers: texto, data: corpo });
      expect(r.status(), corpo.slice(0, 40)).toBe(422);
    }
    expect((await request.post(`${caminho()}/ler`, { headers: texto, data: JSON.stringify({ visitante: "x" }) })).status()).toBe(422);
  });

  test("com domínios permitidos, site de fora é barrado; canal desligado some", async ({ request }) => {
    await admin.from("channel_sessions").update({ metadata: { webchat: { dominios: ["loja.exemplo"] } } }).eq("id", canal);
    const dentro = await request.get(caminho(), { headers: { Origin: "https://www.loja.exemplo" } });
    expect(dentro.status()).toBe(200);
    expect(dentro.headers()["access-control-allow-origin"]).toBe("https://www.loja.exemplo");
    for (const origem of ["https://outro.exemplo", "https://loja.exemplo.atacante.com"]) {
      expect((await request.get(caminho(), { headers: { Origin: origem } })).status()).toBe(403);
      const envio = await request.post(`${caminho()}/enviar`, {
        headers: { ...texto, Origin: origem },
        data: JSON.stringify({ visitante: token(), id: randomUUID(), texto: "de fora" }),
      });
      expect(envio.status()).toBe(403);
    }
    await admin.from("channel_sessions").update({ metadata: {}, status: "STOPPED" }).eq("id", canal);
    expect((await request.get(caminho())).status()).toBe(404);
    await admin.from("channel_sessions").update({ status: "WORKING" }).eq("id", canal);
  });

  test("um visitante que dispara mensagens sem parar recebe 429", async ({ request }) => {
    const v = token();
    const status: number[] = [];
    for (let i = 0; i < 18; i++) {
      const r = await request.post(`${caminho()}/enviar`, {
        headers: texto,
        data: JSON.stringify({ visitante: v, id: randomUUID(), texto: `msg ${i}` }),
      });
      status.push(r.status());
    }
    expect(status.filter((s) => s === 201).length).toBeLessThanOrEqual(15);
    expect(status).toContain(429);
  });

  test("o script do balão é servido para outro site carregar", async ({ request }) => {
    const r = await request.get("/webchat/v1.js");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("javascript");
    expect(r.headers()["cross-origin-resource-policy"] ?? "").not.toBe("same-origin");
  });
});
