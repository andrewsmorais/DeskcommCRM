import { describe, expect, it } from "vitest";

import { limiteRecusadoPeloBanco, respostaDoLimiteDoBanco } from "./limite-no-banco";

describe("recusa do banco por limite do plano", () => {
  it("lê o limite da mensagem do gatilho", () => {
    expect(limiteRecusadoPeloBanco({ message: "plano_limite_atingido:pipelines" })).toBe("pipelines");
    expect(limiteRecusadoPeloBanco({ message: "duplicate key" })).toBeNull();
    expect(limiteRecusadoPeloBanco(null)).toBeNull();
  });

  it("vira o 403 de limite que a tela já mostra", async () => {
    const r = respostaDoLimiteDoBanco({ message: "plano_limite_atingido:chatbots" }, "req");
    expect(r?.status).toBe(403);
    expect((await r!.json()).error.code).toBe("billing_limit");
    expect(respostaDoLimiteDoBanco({ message: "outro" }, "req")).toBeNull();
  });
});
