import { describe, expect, it } from "vitest";

import { sugestoesDeEtiqueta } from "@/lib/contacts/sugestoes-de-etiqueta";

const VOCAB = ["vip", "VIP", "recompra", "novo-cliente", "inadimplente"];

describe("sugestoesDeEtiqueta", () => {
  it("sem nada digitado, sugere o vocabulário (sem duplicar por caixa)", () => {
    expect(sugestoesDeEtiqueta("", VOCAB)).toEqual(["vip", "recompra", "novo-cliente", "inadimplente"]);
  });

  it("filtra pela parte que está sendo digitada", () => {
    expect(sugestoesDeEtiqueta("re", VOCAB)).toEqual(["recompra"]);
    expect(sugestoesDeEtiqueta("CLIENTE", VOCAB)).toEqual(["novo-cliente"]);
  });

  it("não sugere o que já foi escolhido antes da vírgula, mesmo em outra caixa", () => {
    expect(sugestoesDeEtiqueta("VIP, ", VOCAB)).toEqual(["recompra", "novo-cliente", "inadimplente"]);
    expect(sugestoesDeEtiqueta("vip, re", VOCAB)).toEqual(["recompra"]);
  });

  it("não sugere a etiqueta que já está inteira digitada", () => {
    expect(sugestoesDeEtiqueta("recompra", VOCAB)).toEqual([]);
  });

  it("respeita o limite e aguenta vocabulário vazio", () => {
    expect(sugestoesDeEtiqueta("", ["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(sugestoesDeEtiqueta("x", [])).toEqual([]);
  });
});
