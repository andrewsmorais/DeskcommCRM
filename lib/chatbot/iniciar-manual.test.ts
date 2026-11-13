import { describe, expect, it } from "vitest";

import { temPassoFinalizar } from "./iniciar-manual";

/** O chatbot de encerramento só é aceito se tiver quem encerre a conversa. */
describe("temPassoFinalizar", () => {
  const no = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, data: {} });

  it("aceita o fluxo com o passo Finalizar conversa", () => {
    const g = { nodes: [no("a", "inicio_manual"), no("b", "finalizar_conversa")], edges: [] };
    expect(temPassoFinalizar(g as never)).toBe(true);
  });

  it("recusa o fluxo sem ele — o chatbot terminaria e a conversa ficaria aberta", () => {
    const g = { nodes: [no("a", "inicio_manual"), no("b", "mensagem")], edges: [] };
    expect(temPassoFinalizar(g as never)).toBe(false);
  });
});
