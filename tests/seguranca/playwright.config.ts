import { defineConfig } from "@playwright/test";

/**
 * Testes de SEGURANÇA pela tela e pela API, com o Playwright
 * (https://github.com/microsoft/playwright), contra o app LOCAL que o workflow
 * `.github/workflows/seguranca.yml` sobe (Supabase local + baseline.sql + build
 * de produção + contas de teste semeadas). Nunca contra um site no ar: a URL
 * base é recusada se não for localhost.
 */
const BASE = process.env.SEG_BASE_URL ?? "http://localhost:3001";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  throw new Error(`SEG_BASE_URL recusada: ${BASE} não é endereço local`);
}

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "seguranca-playwright", open: "never" }]],
  use: { baseURL: BASE, trace: "retain-on-failure" },
});
