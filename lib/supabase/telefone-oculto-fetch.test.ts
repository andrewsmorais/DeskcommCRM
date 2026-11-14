// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { fetchComTelefoneOculto } from "./telefone-oculto-fetch";

const BASE = "http://supabase.local";
const ORG = "11111111-1111-4111-8111-111111111111";
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

function falso(oculto: boolean | "sem-funcao") {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rest/v1/rpc/fn_eu_oculto_telefone")) {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer jwt-do-usuario");
      expect(JSON.parse(String(init?.body))).toEqual({ p_org: ORG });
      return oculto === "sem-funcao" ? json({ message: "not found" }, 404) : json(oculto);
    }
    if (url.includes("/rest/v1/contacts")) return json([{ name: "Ana", phone_number: "+5511999998888" }]);
    return json([{ name: "sem telefone" }]);
  });
}
const pedir = (f: typeof fetch, caminho: string) =>
  f(`${BASE}${caminho}`, { headers: { Authorization: "Bearer jwt-do-usuario", apikey: "anon" } });

describe("fetch do servidor com telefone oculto", () => {
  it("atendente marcado recebe o número mascarado", async () => {
    const base = falso(true);
    const r = await (await pedir(fetchComTelefoneOculto(base as unknown as typeof fetch, ORG), "/rest/v1/contacts?select=*")).json();
    expect(r).toEqual([{ name: "Ana", phone_number: "+55•••••••••88" }]);
  });

  it("quem não está marcado recebe o número inteiro", async () => {
    const base = falso(false);
    const r = await (await pedir(fetchComTelefoneOculto(base as unknown as typeof fetch, ORG), "/rest/v1/contacts")).json();
    expect(r[0].phone_number).toBe("+5511999998888");
  });

  it("banco sem a 0517 (função ausente) não mascara e não quebra", async () => {
    const base = falso("sem-funcao");
    const r = await (await pedir(fetchComTelefoneOculto(base as unknown as typeof fetch, ORG), "/rest/v1/contacts")).json();
    expect(r[0].phone_number).toBe("+5511999998888");
  });

  it("pergunta uma vez só, e não pergunta quando a resposta não tem telefone", async () => {
    const base = falso(true);
    const f = fetchComTelefoneOculto(base as unknown as typeof fetch, ORG);
    await pedir(f, "/rest/v1/tags");
    expect(base).toHaveBeenCalledTimes(1);
    await pedir(f, "/rest/v1/contacts");
    await pedir(f, "/rest/v1/contacts");
    const perguntas = base.mock.calls.filter((c) => String(c[0]).includes("fn_eu_oculto_telefone"));
    expect(perguntas).toHaveLength(1);
  });

  it("cookie que não é UUID vira pergunta sem organização (o lado seguro)", async () => {
    const corpos: unknown[] = [];
    const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("fn_eu_oculto_telefone")) {
        corpos.push(JSON.parse(String(init?.body)));
        return json(true);
      }
      return json([{ phone_number: "+5511999998888" }]);
    });
    const r = await (await pedir(fetchComTelefoneOculto(base as unknown as typeof fetch, "x' or 1=1"), "/rest/v1/contacts")).json();
    expect(corpos).toEqual([{ p_org: null }]);
    expect(r[0].phone_number).toBe("+55•••••••••88");
  });

  it("falha da pergunta (que não seja função ausente) ESCONDE o número", async () => {
    for (const falha of [() => json({ message: "erro" }, 500), () => json({ message: "bad" }, 400), () => Promise.reject(new Error("rede"))]) {
      const base = vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("fn_eu_oculto_telefone") ? falha() : json([{ phone_number: "+5511999998888" }]),
      );
      const r = await (await pedir(fetchComTelefoneOculto(base as unknown as typeof fetch, ORG), "/rest/v1/contacts")).json();
      expect(r[0].phone_number).toBe("+55•••••••••88");
    }
  });
});
