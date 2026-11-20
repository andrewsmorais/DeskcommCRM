import { describe, expect, it } from "vitest";

import { janelaDoMes, mesLegivel, mesLocal } from "./periodo";

describe("lib/metas/periodo", () => {
  it("mesLocal devolve YYYY-MM do calendário local", () => {
    expect(mesLocal(new Date(2026, 8, 30, 23, 0))).toBe("2026-09");
  });

  it("janelaDoMes vai do dia 1 ao dia 1 do mês seguinte, e vira o ano", () => {
    const j = janelaDoMes("2026-12");
    expect(j.from.startsWith("2026-12-01T00:00:00")).toBe(true);
    expect(j.to.startsWith("2027-01-01T00:00:00")).toBe(true);
  });

  it("janelaDoMes recusa mês inválido", () => {
    expect(() => janelaDoMes("2026-13")).toThrow();
    expect(() => janelaDoMes("abc")).toThrow();
  });

  it("mesLegivel formata MM/AAAA e devolve null sem período", () => {
    expect(mesLegivel("2026-09-01")).toBe("09/2026");
    expect(mesLegivel(null)).toBeNull();
  });
});
