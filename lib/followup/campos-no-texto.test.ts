import { describe, expect, it } from "vitest";

import { preencherCamposDoNegocio } from "./campos-no-texto";

const lead = {
  contact_name: "Maria Silva",
  custom_fields: {
    produto: "Mochila",
    valor: "R$ 259,00",
    link_checkout: "https://loja.com/recover/1",
  },
};

describe("variáveis no texto do follow-up", () => {
  it("preenche produto, valor, link e o primeiro nome", () => {
    expect(
      preencherCamposDoNegocio(
        "Oi {{primeiro_nome}}! Sua {{produto}} ({{valor}}) ficou no carrinho: {{link_checkout}}",
        lead,
      ),
    ).toBe("Oi Maria! Sua Mochila (R$ 259,00) ficou no carrinho: https://loja.com/recover/1");
  });

  it("{{nome}} é o nome inteiro; a reserva vale quando falta o dado", () => {
    expect(preencherCamposDoNegocio("{{nome}}", lead)).toBe("Maria Silva");
    expect(preencherCamposDoNegocio('Oi {{primeiro_nome|"cliente"}}', { custom_fields: {} })).toBe(
      "Oi cliente",
    );
  });

  it("campo que falta vira vazio, nunca a marcação crua", () => {
    expect(preencherCamposDoNegocio("Pix: {{pix_copia_e_cola}}", lead)).toBe("Pix: ");
  });

  it("sem marcação, o texto sai igual", () => {
    expect(preencherCamposDoNegocio("Oi! Tudo bem?", null)).toBe("Oi! Tudo bem?");
  });
});
