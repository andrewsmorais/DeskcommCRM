/**
 * `x-pathname` que chega aos Server Components é o do SERVIDOR, nunca o do cliente.
 *
 * O layout de `/app` decide o muro da assinatura por esse cabeçalho. O `proxy`
 * fazia `NextResponse.next({ request: { headers: request.headers } })` e só
 * DEPOIS `request.headers.set("x-pathname", …)` — mas o Next tira a foto dos
 * cabeçalhos de requisição na construção da resposta, então o valor
 * encaminhado era o que o navegador mandou. Um cliente que enviasse
 * `x-pathname: /app/settings/billing` em qualquer página passava pelo muro.
 *
 * O Next encaminha os cabeçalhos sobrescritos como `x-middleware-request-<nome>`
 * na resposta do middleware; é isso que o teste lê.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.exemplo",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-de-teste",
      SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
      NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com.br",
      SUPABASE_SERVER_URL: "",
    },
  }));
});

afterEach(() => {
  vi.doUnmock("@/lib/env");
});

describe("proxy — x-pathname", () => {
  it("sobrescreve o x-pathname enviado pelo cliente com o caminho real", async () => {
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("https://crm.exemplo.com.br/login", {
      headers: { "x-pathname": "/app/settings/billing" },
    });
    const res = await proxy(req);
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/login");
  });

  it("sem cabeçalho do cliente, encaminha o caminho real", async () => {
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    const res = await proxy(new NextRequest("https://crm.exemplo.com.br/login/esqueci"));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/login/esqueci");
  });
});
