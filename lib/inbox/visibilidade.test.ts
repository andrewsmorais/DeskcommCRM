/**
 * A régua das conversas ocultas (migration 0510): a mesma para a lista e para a
 * contagem das abas — o número da aba nunca conta o que a lista não mostra.
 */
import { describe, expect, it } from "vitest";

import { aplicarOcultas, filtroDeOcultas } from "./visibilidade";

/** Consulta de mentira que só anota os filtros pedidos. */
class Consulta {
  filtros: string[] = [];
  eq(coluna: string, valor: string) {
    this.filtros.push(`${coluna}=${valor}`);
    return this;
  }
  neq(coluna: string, valor: string) {
    this.filtros.push(`${coluna}!=${valor}`);
    return this;
  }
}

describe("conversas ocultas", () => {
  it("sem o parâmetro (ou com valor desconhecido), a caixa de entrada esconde as ocultas", () => {
    expect(filtroDeOcultas(null)).toBe("excluir");
    expect(filtroDeOcultas(undefined)).toBe("excluir");
    expect(filtroDeOcultas("talvez")).toBe("excluir");
    expect(aplicarOcultas(new Consulta(), "excluir").filtros).toEqual(["visibilidade=visivel"]);
  });

  it('o filtro "Ocultas" pede só as ocultas (as duas formas de oculta)', () => {
    expect(filtroDeOcultas("so")).toBe("so");
    expect(aplicarOcultas(new Consulta(), "so").filtros).toEqual(["visibilidade!=visivel"]);
  });

  it("incluir não filtra nada (integrações que querem a lista inteira)", () => {
    expect(filtroDeOcultas("incluir")).toBe("incluir");
    expect(aplicarOcultas(new Consulta(), "incluir").filtros).toEqual([]);
  });
});
