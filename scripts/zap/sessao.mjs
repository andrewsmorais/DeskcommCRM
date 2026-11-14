/**
 * Entra no app como uma conta de TESTE (o atendente semeado por
 * scripts/seed-e2e-credentials.ts) e grava o cabeçalho Cookie da sessão, para
 * o ZAP varrer as telas e rotas de quem está logado — não só a porta de fora.
 *
 * Uso (no CI, contra o app local):  node scripts/zap/sessao.mjs http://localhost:3001 /tmp/zap-cookie.txt
 * Só roda contra endereço local: nunca contra um site no ar.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [base = "http://localhost:3001", saida = "/tmp/zap-cookie.txt"] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error(`recusado: ${base} não é endereço local`);
  process.exit(2);
}
const creds = JSON.parse(readFileSync(".e2e-creds.json", "utf8"));
const conta = creds.users.agent ?? creds.users.manager;
if (!conta?.email) throw new Error("sem conta de teste em .e2e-creds.json");

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ baseURL: base });
await pagina.goto("/login");
await pagina.locator("#email").fill(conta.email);
await pagina.locator("#password").fill(creds.password);
await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
const cookies = await pagina.context().cookies(base);
await navegador.close();
if (cookies.length === 0) throw new Error("o login não deixou cookie nenhum");
writeFileSync(saida, cookies.map((c) => `${c.name}=${c.value}`).join("; "));
console.info(`sessão de ${conta.email}: ${cookies.length} cookie(s) gravado(s) em ${saida}`);
