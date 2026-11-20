import { describe, expect, it } from "vitest";

import { composerBloqueadoAteAssumir } from "./bloqueio-ate-assumir";

describe("caixa bloqueada até assumir", () => {
  it("desligada (o padrão): nunca trava", () => {
    expect(composerBloqueadoAteAssumir({ ligada: undefined, donoDaConversa: null, atendenteId: "a" })).toBe(false);
    expect(composerBloqueadoAteAssumir({ ligada: false, donoDaConversa: "b", atendenteId: "a" })).toBe(false);
  });
  it("ligada: trava a conversa sem dono e a de outra pessoa; libera a sua", () => {
    expect(composerBloqueadoAteAssumir({ ligada: true, donoDaConversa: null, atendenteId: "a" })).toBe(true);
    expect(composerBloqueadoAteAssumir({ ligada: true, donoDaConversa: "b", atendenteId: "a" })).toBe(true);
    expect(composerBloqueadoAteAssumir({ ligada: true, donoDaConversa: "a", atendenteId: "a" })).toBe(false);
  });
});
