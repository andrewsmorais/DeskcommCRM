/**
 * O que um atacante tenta primeiro, provado pela tela e pela API do app real:
 *   1. cabeçalhos de proteção do navegador;
 *   2. sem login, nada sai (API 401, tela manda para o login);
 *   3. o cookie de sessão não é legível por script nem viaja de outro site;
 *   4. isolamento entre empresas: o atendente de A não alcança o contato de B;
 *   5. papel: "Somente leitura" não muda configuração;
 *   6. XSS: nome de contato com código vira TEXTO na tela, não roda;
 *   7. o retorno do login não manda o usuário para site de fora.
 *
 * As contas são as de teste (scripts/seed-e2e-credentials.ts, `.e2e-creds.json`).
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

type Creds = { password: string; users: Record<string, { email: string }> };
const creds = JSON.parse(readFileSync(".e2e-creds.json", "utf8")) as Creds;

async function entrar(page: Page, papel: "agent" | "viewer" | "manager") {
  const conta = creds.users[papel];
  expect(conta?.email, `sem a conta ${papel} em .e2e-creds.json`).toBeTruthy();
  await page.goto("/login");
  await page.locator("#email").fill(conta!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

const api = (page: Page): APIRequestContext => page.request;

test.describe("1. cabeçalhos de proteção", () => {
  for (const caminho of ["/login", "/api/v1/health"]) {
    test(`em ${caminho}`, async ({ request }) => {
      const r = await request.get(caminho);
      const h = r.headers();
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      const csp = h["content-security-policy"] ?? "";
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(h["referrer-policy"]).toBeTruthy();
      expect(h["x-powered-by"], "o servidor não deve anunciar a tecnologia").toBeUndefined();
    });
  }
});

test.describe("2. sem login, nada sai", () => {
  for (const caminho of ["/api/v1/contacts", "/api/v1/conversations", "/api/v1/equipe/conversas", "/api/v1/settings/variaveis"]) {
    test(`GET ${caminho} → 401 sem dado`, async ({ request }) => {
      const r = await request.get(caminho, { maxRedirects: 0 });
      expect([401, 307]).toContain(r.status());
      const texto = await r.text();
      expect(texto).not.toContain('"data"');
    });
  }

  test("a tela de contatos manda para o login", async ({ page }) => {
    await page.goto("/app/contacts");
    await expect(page).toHaveURL(/\/login/);
  });
});

test("3. o cookie de sessão é HttpOnly e SameSite", async ({ page }) => {
  await entrar(page, "agent");
  // O app usa nome próprio (`sb-deskcomm-auth`, em pedaços .0/.1 quando grande).
  const sessao = (await page.context().cookies()).filter((c) => c.name.startsWith("sb-deskcomm-auth"));
  expect(sessao.length, "o login não deixou o cookie de sessão").toBeGreaterThan(0);
  for (const c of sessao) {
    expect(c.httpOnly, `${c.name} legível por script`).toBe(true);
    expect(["Strict", "Lax"]).toContain(c.sameSite);
  }
  const lidoPorScript = await page.evaluate(() => document.cookie);
  expect(lidoPorScript).not.toContain("sb-deskcomm-auth");
});

test("4. o atendente de uma empresa não alcança o contato de outra", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !chave, "sem o acesso de servidor do banco local");
  const admin = createClient(url!, chave!, { auth: { persistSession: false } });
  const slug = `seg-outra-${randomUUID().slice(0, 8)}`;
  const { data: org, error: e1 } = await admin
    .from("organizations")
    .insert({ slug, legal_name: slug, display_name: "Outra Empresa" })
    .select("id")
    .single();
  expect(e1, e1?.message).toBeNull();
  const nome = `Cliente Secreto ${randomUUID().slice(0, 6)}`;
  const { data: contato, error: e2 } = await admin
    .from("contacts")
    .insert({ organization_id: org!.id, name: nome, email: `${slug}@exemplo.test`, source: "manual" })
    .select("id")
    .single();
  expect(e2, e2?.message).toBeNull();

  await entrar(page, "agent");
  const direto = await api(page).get(`/api/v1/contacts/${contato!.id}`);
  expect([403, 404]).toContain(direto.status());
  expect(await direto.text()).not.toContain(nome);

  const busca = await api(page).get(`/api/v1/contacts?search=${encodeURIComponent(nome)}`);
  expect(busca.ok()).toBe(true);
  expect(await busca.text()).not.toContain(nome);

  const mudar = await api(page).patch(`/api/v1/contacts/${contato!.id}`, { data: { name: "invadido" } });
  expect([403, 404]).toContain(mudar.status());
  const { data: depois } = await admin.from("contacts").select("name").eq("id", contato!.id).single();
  expect(depois?.name).toBe(nome);
});

test("5. 'Somente leitura' não muda configuração da empresa", async ({ page }) => {
  await entrar(page, "viewer");
  const r = await api(page).patch("/api/v1/settings/variaveis", { data: { variaveis: [{ chave: "pix", valor: "x" }] } });
  expect(r.status()).toBe(403);
  const c = await api(page).patch("/api/v1/settings/conversas", { data: { assinatura: "sempre" } });
  expect(c.status()).toBe(403);
  await page.goto("/app/settings/variaveis");
  await expect(page).toHaveURL(/\/403|\/login|\/app$/);
});

test("6. nome de contato com código aparece como texto e não roda", async ({ page }) => {
  await entrar(page, "agent");
  const marca = randomUUID().slice(0, 6);
  const nome = `<img src=x onerror="window.__xss_${marca}=1">Xss${marca}`;
  const r = await api(page).post("/api/v1/contacts", {
    data: { name: nome, email: `xss-${marca}@exemplo.test` },
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  let alerta = false;
  page.on("dialog", async (d) => {
    alerta = true;
    await d.dismiss();
  });
  await page.goto("/app/contacts");
  await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(`Xss${marca}`);
  await expect(page.getByText(`Xss${marca}`).first()).toBeVisible({ timeout: 30_000 });
  const rodou = await page.evaluate((m) => (window as unknown as Record<string, unknown>)[`__xss_${m}`], marca);
  expect(rodou, "o código do nome do contato rodou no navegador").toBeUndefined();
  expect(alerta).toBe(false);
});

test("7. o retorno do login não leva para site de fora", async ({ request }) => {
  for (const destino of ["https://evil.example/", "//evil.example/", "/\\evil.example"]) {
    const r = await request.get(`/auth/callback?next=${encodeURIComponent(destino)}`, { maxRedirects: 0 });
    const para = r.headers()["location"] ?? "";
    expect(para, `redirecionou para ${para}`).not.toMatch(/evil\.example/);
    expect(await r.text()).not.toMatch(/evil\.example/);
  }
});

test("8. texto com caractere NULO é recusado com 422, não derruba a rota", async ({ page }) => {
  await entrar(page, "manager");
  for (const corpo of [
    '{"variaveis":[{"chave":"pix","valor":"a\\u0000b"}]}',
    '{"variaveis":[{"chave":"pix","valor":"\\ud80f"}]}',
  ]) {
    const r = await api(page).patch("/api/v1/settings/variaveis", {
      data: corpo,
      headers: { "content-type": "application/json" },
    });
    expect(r.status(), await r.text()).toBe(422);
  }
});

test("9. login com injeção de SQL não entra", async ({ page }) => {
  for (const [email, senha] of [
    ["zaproxy@example.com' OR 1=1 -- ", "x"],
    [creds.users.agent!.email, "ZAP' OR '1'='1' -- "],
  ]) {
    await page.goto("/login");
    await page.locator("#email").fill(email!);
    await page.locator("#password").fill(senha!);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/\/login/);
  }
});
