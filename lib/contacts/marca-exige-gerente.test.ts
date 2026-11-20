import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { recusaSeFichaMarcada } from "./marca-exige-gerente";

function db(ficha: unknown, erro = false): SupabaseClient {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.maybeSingle = async () => ({ data: ficha, error: erro ? { message: "x" } : null });
  return { from: () => q } as unknown as SupabaseClient;
}
const base = { organizationId: "o", contactId: "c", requestId: "r" };

describe("recusaSeFichaMarcada (achado 11)", () => {
  it("atendente + ficha marcada (qualquer das duas): 403", async () => {
    for (const ficha of [{ is_personal: true }, { ai_opt_out: true }]) {
      const r = await recusaSeFichaMarcada({ ...base, supabase: db(ficha), papel: "agent" });
      expect(r?.status).toBe(403);
    }
  });
  it("atendente + ficha comum: segue", async () => {
    expect(
      await recusaSeFichaMarcada({ ...base, supabase: db({ is_personal: false, ai_opt_out: false }), papel: "agent" }),
    ).toBeNull();
  });
  it("gerente e admin seguem sem nem ler a ficha", async () => {
    for (const papel of ["manager", "admin"]) {
      expect(await recusaSeFichaMarcada({ ...base, supabase: db(null, true), papel })).toBeNull();
    }
  });
  it("erro de leitura não vira permissão", async () => {
    const r = await recusaSeFichaMarcada({ ...base, supabase: db(null, true), papel: "agent" });
    expect(r?.status).toBe(500);
  });
});
