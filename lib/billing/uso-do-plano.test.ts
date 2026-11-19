import { describe, expect, it } from "vitest";

import { excessosParaOPlano, frasesDoExcesso } from "./uso-do-plano";

describe("uso contra o pacote do plano", () => {
  it("lista só o que passa do pacote, com o máximo de cada um", () => {
    const uso = { whatsapp: 6, pipelines: 2, agentes_ia: 3, chatbots: 1, usuarios: 2 };
    expect(excessosParaOPlano(uso, "essencial")).toEqual([
      { limite: "whatsapp", uso: 6, maximo: 2 },
      { limite: "agentes_ia", uso: 3, maximo: 1 },
    ]);
    expect(excessosParaOPlano(uso, "escala")).toEqual([]);
  });

  it("a frase diz quanto há e quanto o plano permite", () => {
    expect(
      frasesDoExcesso([{ limite: "chatbots", uso: 2, maximo: 1 }], "essencial"),
    ).toBe("2 chatbots ligados (o Essencial permite 1)");
  });
});
