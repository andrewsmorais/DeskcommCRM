/**
 * Testar o agente como conversa: o painel recorta o histórico para caber no
 * limite que a rota aceita (30 mensagens, 20.000 caracteres), tirando as mais
 * antigas primeiro — assim a conversa segue em vez de a rota recusar.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiClient: { post: vi.fn() } }));

import { historicoQueCabe } from "@/app/app/ai/agents/[id]/_components/TestPanel";

const msg = (body: string, i: number) => ({
  direction: (i % 2 === 0 ? "inbound" : "outbound") as "inbound" | "outbound",
  body,
});

describe("historicoQueCabe", () => {
  it("conversa curta passa inteira", () => {
    const c = ["oi", "olá!", "preço?"].map(msg);
    expect(historicoQueCabe(c)).toEqual(c);
  });

  it("mais de 30 mensagens: ficam as 30 últimas", () => {
    const c = Array.from({ length: 35 }, (_, i) => msg(`m${i}`, i));
    const r = historicoQueCabe(c);
    expect(r).toHaveLength(30);
    expect(r[0]?.body).toBe("m5");
    expect(r.at(-1)?.body).toBe("m34");
  });

  it("acima de 20.000 caracteres: saem as mais antigas", () => {
    const c = Array.from({ length: 5 }, (_, i) => msg("x".repeat(6000) + i, i));
    const r = historicoQueCabe(c);
    expect(r.reduce((n, m) => n + m.body.length, 0)).toBeLessThanOrEqual(20_000);
    expect(r.at(-1)?.body.endsWith("4")).toBe(true);
  });
});
