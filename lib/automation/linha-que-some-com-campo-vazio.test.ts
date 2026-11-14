// @vitest-environment node
import { describe, expect, it } from "vitest";

import { renderTemplate } from "./template";

describe("automação: {{#campo}}...{{/campo}} some quando o campo está vazio", () => {
  const texto = "Olá {{primeiro_nome}}!\n{{#email}}📧 E-mail: {{email}}{{/email}}\nAté logo.";

  it("com o campo preenchido, a linha sai com o valor", () => {
    expect(renderTemplate(texto, { contact: { name: "Ana Souza", email: "ana@x.com" } })).toBe(
      "Olá Ana!\n📧 E-mail: ana@x.com\nAté logo.",
    );
  });

  it("com o campo vazio, a linha inteira some", () => {
    expect(renderTemplate(texto, { contact: { name: "Ana Souza", email: "" } })).toBe("Olá Ana!\nAté logo.");
  });

  it("texto sem bloco sai como antes", () => {
    expect(renderTemplate("Oi {{nome}}", { contact: { name: "Ana" } })).toBe("Oi Ana");
  });
});
