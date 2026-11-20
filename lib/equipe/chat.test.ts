import { describe, expect, it } from "vitest";

import { chaveDaMensagem, contarNaoLidas, novaMensagemSchema, previa } from "./chat";

const EU = "11111111-1111-4111-8111-111111111111";
const BIA = "22222222-2222-4222-8222-222222222222";
const CAIO = "33333333-3333-4333-8333-333333333333";

describe("chat interno da equipe — regras puras", () => {
  it("a chave da conversa é 'geral' ou a OUTRA pessoa", () => {
    expect(chaveDaMensagem({ autor_user_id: BIA, destinatario_user_id: null }, EU)).toBe("geral");
    expect(chaveDaMensagem({ autor_user_id: EU, destinatario_user_id: BIA }, EU)).toBe(BIA);
    expect(chaveDaMensagem({ autor_user_id: BIA, destinatario_user_id: EU }, EU)).toBe(BIA);
    expect(chaveDaMensagem({ autor_user_id: BIA, destinatario_user_id: CAIO }, EU)).toBeNull();
  });

  it("conta só a mensagem dos outros depois do ponto lido; sem ponto, desde a entrada", () => {
    const m = (autor: string, dest: string | null, quando: string) => ({
      autor_user_id: autor,
      destinatario_user_id: dest,
      created_at: quando,
    });
    const r = contarNaoLidas(
      [
        m(BIA, null, "2026-11-01T10:00:00Z"), // antes de eu entrar
        m(BIA, null, "2026-11-10T10:00:00Z"),
        m(EU, null, "2026-11-10T11:00:00Z"), // minha
        m(BIA, EU, "2026-11-10T09:00:00Z"), // já lida
        m(BIA, EU, "2026-11-10T12:00:00Z"),
        m(CAIO, EU, "2026-11-10T12:00:00Z"),
        m(BIA, CAIO, "2026-11-10T12:00:00Z"), // não é minha
      ],
      EU,
      { [BIA]: "2026-11-10T10:00:00Z" },
      "2026-11-05T00:00:00Z",
    );
    expect(r).toEqual({ geral: 1, [BIA]: 1, [CAIO]: 1 });
  });

  it("valida a mensagem e encurta a prévia", () => {
    expect(novaMensagemSchema.safeParse({ com: "geral", corpo: "  " }).success).toBe(false);
    expect(novaMensagemSchema.safeParse({ com: "x", corpo: "oi" }).success).toBe(false);
    expect(novaMensagemSchema.safeParse({ com: BIA, corpo: "oi" }).success).toBe(true);
    expect(previa("linha 1\nlinha 2")).toBe("linha 1 linha 2");
    expect(previa("a".repeat(100), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
