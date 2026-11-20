import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { veTodasAsConversasDaFicha } from "./visao-das-conversas-da-ficha";

function db(count: number | null, error: string | null = null): SupabaseClient {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ count, error: error ? { message: error } : null }).then(ok);
  return { from: () => q } as unknown as SupabaseClient;
}
const args = (sessao: SupabaseClient, admin: SupabaseClient) => ({
  sessao,
  admin,
  organizationId: "o",
  contactId: "c",
});

describe("veTodasAsConversasDaFicha (achado 13)", () => {
  it("vê tudo: passa", async () => {
    expect(await veTodasAsConversasDaFicha(args(db(3), db(3)))).toBe(true);
  });
  it("não vê uma conversa do colega: recusa", async () => {
    expect(await veTodasAsConversasDaFicha(args(db(2), db(3)))).toBe(false);
  });
  it("ficha sem conversa: passa", async () => {
    expect(await veTodasAsConversasDaFicha(args(db(0), db(0)))).toBe(true);
  });
  it("erro de leitura não vira permissão", async () => {
    await expect(veTodasAsConversasDaFicha(args(db(3), db(3, "caiu")))).rejects.toThrow("caiu");
  });
});
