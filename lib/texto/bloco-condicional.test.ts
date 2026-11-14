import { describe, expect, it } from "vitest";

import { aplicarBlocosCondicionais } from "./bloco-condicional";

const com = (preenchidos: Record<string, string>) => ({
  temValor: (c: string) => (preenchidos[c] ?? "").trim() !== "",
});

describe("bloco condicional {{#campo}}...{{/campo}}", () => {
  const texto = "Olá!\n{{#apolice}}🔢 Apólice: {{apolice}}{{/apolice}}\nObrigado.";

  it("com valor, o miolo fica e as marcas saem", () => {
    expect(aplicarBlocosCondicionais(texto, com({ apolice: "123" }))).toBe("Olá!\n🔢 Apólice: {{apolice}}\nObrigado.");
  });

  it("sem valor, a linha inteira some (sem linha em branco)", () => {
    expect(aplicarBlocosCondicionais(texto, com({}))).toBe("Olá!\nObrigado.");
  });

  it("no meio de uma linha, só o miolo sai", () => {
    expect(aplicarBlocosCondicionais("Oi{{#empresa}}, da {{empresa}}{{/empresa}}!", com({}))).toBe("Oi!");
  });

  it("rascunho do Inbox: sem valor, o bloco fica para o atendente ver", () => {
    expect(aplicarBlocosCondicionais(texto, { ...com({}), manterSemValor: true })).toBe(
      "Olá!\n🔢 Apólice: {{apolice}}\nObrigado.",
    );
  });

  it("sem fechamento é texto solto; sem bloco, nada muda", () => {
    expect(aplicarBlocosCondicionais("{{#a}} sem fim", com({}))).toBe("{{#a}} sem fim");
    expect(aplicarBlocosCondicionais("Olá {{nome}}", com({}))).toBe("Olá {{nome}}");
  });

  it("aceita campo com ponto e blocos aninhados", () => {
    expect(
      aplicarBlocosCondicionais("{{#lead.cpf}}CPF {{lead.cpf}}{{#lead.rg}} RG {{lead.rg}}{{/lead.rg}}{{/lead.cpf}}", com({ "lead.cpf": "1" })),
    ).toBe("CPF {{lead.cpf}}");
  });
});
