/**
 * Entra no app como uma conta de TESTE (scripts/seed-e2e-credentials.ts) e
 * grava o cabeçalho Cookie da sessão, para as ferramentas de segurança (ZAP,
 * schemathesis, garak) testarem o que só quem está logado alcança.
 *
 * Uso (no CI, contra o app local):
 *   node scripts/zap/sessao.mjs http://localhost:3001 /tmp/cookie.txt [agent|manager|viewer|admin]
 * `admin` passa pelo código de verificação (TOTP) com o segredo semeado.
 * Só roda contra endereço local: nunca contra um site no ar.
 */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [base = "http://localhost:3001", saida = "/tmp/zap-cookie.txt", papel = "agent"] = process.argv.slice(2);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error(`recusado: ${base} não é endereço local`);
  process.exit(2);
}
const creds = JSON.parse(readFileSync(".e2e-creds.json", "utf8"));
const conta = creds.users[papel];
if (!conta?.email) throw new Error(`sem a conta ${papel} em .e2e-creds.json`);

/** RFC 6238 (30 s, 6 dígitos, SHA-1) — o mesmo que o app de autenticação calcula. */
function totp(segredoBase32, quando = Date.now()) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredoBase32.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const chave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(quando / 30000)));
  const h = createHmac("sha1", chave).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ baseURL: base });
await pagina.goto("/login");
await pagina.locator("#email").fill(conta.email);
await pagina.locator("#password").fill(creds.password);
await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
await pagina.waitForURL((u) => !u.pathname.startsWith("/login") || u.pathname.startsWith("/login/mfa"), { timeout: 60_000 });

if (new URL(pagina.url()).pathname.startsWith("/login/mfa")) {
  const segredo = papel === "admin" ? creds.admin_totp?.secret : papel === "dono" ? creds.dono_totp?.secret : null;
  if (!segredo) throw new Error(`a conta ${papel} pede código de verificação e não há segredo semeado`);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (30000 - (Date.now() % 30000) < 3000) await pagina.waitForTimeout(3500);
    const digito = pagina.locator('input[aria-label="Dígito 1"]');
    await digito.waitFor({ state: "visible", timeout: 15_000 });
    await digito.click();
    await pagina.keyboard.type(totp(segredo), { delay: 40 });
    try {
      await pagina.waitForURL(/\/app(\/|$)/, { timeout: 10_000 });
      break;
    } catch {
      await pagina.waitForTimeout(30000 - (Date.now() % 30000) + 300);
    }
  }
}
if (new URL(pagina.url()).pathname.startsWith("/login")) throw new Error(`o login de ${papel} não passou`);

const cookies = await pagina.context().cookies(base);
await navegador.close();
if (cookies.length === 0) throw new Error("o login não deixou cookie nenhum");
writeFileSync(saida, cookies.map((c) => `${c.name}=${c.value}`).join("; "));
console.info(`sessão de ${papel}: ${cookies.length} cookie(s) gravado(s) em ${saida}`);
