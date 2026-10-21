import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const COOKIE_CANONICO = "sb-deskcomm-auth";

function nomeConfigurado(path: string, padrao: RegExp): string | undefined {
  return readFileSync(join(ROOT, path), "utf8").match(padrao)?.[1];
}

describe("cookie de sessão Supabase", () => {
  it("usa o mesmo nome válido no browser, servidor e proxy de borda", () => {
    const nomes = [
      nomeConfigurado("lib/supabase/browser.ts", /name:\s*"([^"]+)"/),
      nomeConfigurado("lib/supabase/server.ts", /name:\s*"([^"]+)"/),
      nomeConfigurado("proxy.ts", /const COOKIE_NAME\s*=\s*"([^"]+)"/),
    ];

    expect(nomes).toEqual(Array(3).fill(COOKIE_CANONICO));
    expect(COOKIE_CANONICO).toMatch(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/);
  });
});
