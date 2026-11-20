import { describe, expect, it } from "vitest";

import { motivoDaFalhaDaMensagem } from "./motivo-da-falha";

const t = (s: string) => s;

describe("o motivo da falha que a bolha mostra", () => {
  it("nunca mostra o texto cru do transporte (endereço interno, erro de rede)", () => {
    expect(
      motivoDaFalhaDaMensagem({ error_code: "send_failed", error_message: "fetch failed http://waha:3000/api/sendText" }, t),
    ).toBe("Não foi possível enviar esta mensagem.");
    expect(motivoDaFalhaDaMensagem({ error_code: null, error_message: "connect ECONNREFUSED 10.0.0.4:3000" }, t)).toBe(
      "Não foi possível enviar esta mensagem.",
    );
  });

  it("frase nossa para o código que nós gravamos", () => {
    expect(motivoDaFalhaDaMensagem({ error_code: "channel_archived", error_message: "x" }, t)).toBe(
      "Este número foi excluído da Central de Conexões.",
    );
  });

  it("texto legível gravado aparece como está", () => {
    expect(motivoDaFalhaDaMensagem({ error_code: null, error_message: "Número sem WhatsApp." }, t)).toBe("Número sem WhatsApp.");
  });
});
