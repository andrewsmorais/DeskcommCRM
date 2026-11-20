/** "Aguardar até" com dia útil: pula fim de semana (dias desmarcados) e feriado nacional. */
import { describe, expect, it } from "vitest";

import { lerConfig } from "./passos";
import { proximoHorario } from "./relogio";

const FUSO = "America/Sao_Paulo";
const util = lerConfig("aguardar_ate", { quando: "dias", hora: "09:00", dias: [1, 2, 3, 4, 5], pular_feriados: true });

describe("dia útil", () => {
  it("sexta à tarde → segunda 9h", () => {
    // 13/11/2026 é sexta.
    const r = proximoHorario(util, new Date("2026-11-13T18:00:00-03:00"), FUSO);
    expect(r.toISOString()).toBe(new Date("2026-11-16T09:00:00-03:00").toISOString());
  });

  it("véspera de feriado → pula o feriado (20/11 é Consciência Negra, feriado nacional)", () => {
    const r = proximoHorario(util, new Date("2026-11-19T18:00:00-03:00"), FUSO);
    expect(r.toISOString()).toBe(new Date("2026-11-23T09:00:00-03:00").toISOString());
  });

  it("sem pular feriados, o feriado conta", () => {
    const c = { ...util, pular_feriados: false };
    const r = proximoHorario(c, new Date("2026-11-19T18:00:00-03:00"), FUSO);
    expect(r.toISOString()).toBe(new Date("2026-11-20T09:00:00-03:00").toISOString());
  });

  it("fim de ano: sexta 25/12 feriado + fim de semana → segunda 28/12", () => {
    const r = proximoHorario(util, new Date("2026-12-24T18:00:00-03:00"), FUSO);
    expect(r.toISOString()).toBe(new Date("2026-12-28T09:00:00-03:00").toISOString());
  });
});
