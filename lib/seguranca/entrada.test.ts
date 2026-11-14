import { describe, expect, it } from "vitest";

import { motivoDeRecusaDoJson, textoGuardavel } from "./entrada";

describe("entradas que o banco recusa", () => {
  it("texto comum, acento e emoji passam; NULO e par Unicode partido não", () => {
    expect(textoGuardavel("Olá, João 👋")).toBe(true);
    expect(textoGuardavel("a\u0000b")).toBe(false);
    expect(textoGuardavel("\ud80f")).toBe(false);
    expect(textoGuardavel("\udc00x")).toBe(false);
  });

  it("olha chaves e valores em qualquer profundidade (o caso do schemathesis)", () => {
    expect(motivoDeRecusaDoJson('{"variaveis":[{"chave":"pix","valor":"ok"}]}')).toBeNull();
    expect(motivoDeRecusaDoJson('{"variaveis":[{"chave":"pix","valor":"\\u0000"}]}')).toBe("texto_com_caractere_invalido");
    expect(motivoDeRecusaDoJson('{"a":{"\\ud80f":1}}')).toBe("texto_com_caractere_invalido");
    expect(motivoDeRecusaDoJson('{"a":["x",["\\udafc"]]}')).toBe("texto_com_caractere_invalido");
  });

  it("a barra invertida literal seguida de u0000 é texto normal", () => {
    expect(motivoDeRecusaDoJson('{"a":"\\\\u0000"}')).toBeNull();
  });

  it("corpo que nem é JSON segue para a rota responder", () => {
    expect(motivoDeRecusaDoJson("isto não é json")).toBeNull();
  });

});
