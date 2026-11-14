import { describe, expect, it } from "vitest";

import { descreverAgenda, lerAgenda } from "./agenda";
import { iniciarFluxo, retomarFluxo } from "./motor";
import { proximoDaAgenda } from "./relogio";
import { problemasDoGrafo } from "./validar";

const SP = "America/Sao_Paulo";
// Quarta-feira, 22/10/2026, 10:30 em São Paulo.
const agora = new Date("2026-10-22T13:30:00Z");
const emSP = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("sv-SE", { timeZone: SP, dateStyle: "short", timeStyle: "short" }).format(d) : null;

describe("agenda do Aguardar até (cinco campos)", () => {
  it("lê lista, faixa, passo e domingo como 0 ou 7", () => {
    const a = lerAgenda("*/15 8-18/5 1,15 * 7");
    expect(typeof a).toBe("object");
    if (typeof a === "string") return;
    expect(a.minutos).toEqual([0, 15, 30, 45]);
    expect(a.horas).toEqual([8, 13, 18]);
    expect(a.diasDoMes).toEqual([1, 15]);
    expect(a.diasDaSemana).toEqual([0]);
  });

  it("recusa o que não entende, com frase", () => {
    for (const ruim of ["", "0 9 * *", "60 9 * * *", "0 24 * * *", "0 9 0 * *", "0 9 * 13 *", "0 9 * * 8", "a b c d e", "0 9 5-1 * *", "0 9 */0 * *", "0 9 31 2 *", "0 9 * * 1;rm", `0 9 * * ${"1,".repeat(50)}1`])
      expect(typeof lerAgenda(ruim), ruim).toBe("string");
  });

  it("o próximo horário sai no relógio da empresa", () => {
    expect(emSP(proximoDaAgenda("0 9 * * 1-5", agora, SP))).toBe("2026-10-23 09:00"); // quinta
    expect(emSP(proximoDaAgenda("0 11 * * *", agora, SP))).toBe("2026-10-22 11:00"); // ainda hoje
    expect(emSP(proximoDaAgenda("30 8 1,15 * *", agora, SP))).toBe("2026-11-01 08:30");
    expect(emSP(proximoDaAgenda("0 10 * 12 6", agora, SP))).toBe("2026-12-05 10:00"); // 1º sábado de dezembro
    expect(emSP(proximoDaAgenda("0 9 29 2 *", agora, SP))).toBeNull(); // 2027 não é bissexto
    expect(proximoDaAgenda("lixo", agora, SP)).toBeNull();
  });

  it("dia do mês E dia da semana restritos: vale um OU outro (regra do cron)", () => {
    // Dia 1 ou sexta: a sexta 23/10 chega antes do dia 1º.
    expect(emSP(proximoDaAgenda("0 9 1 * 5", agora, SP))).toBe("2026-10-23 09:00");
  });

  it("dita a agenda em português", () => {
    expect(descreverAgenda("0 9 * * 1-5")).toBe("De segunda a sexta, às 09:00");
    expect(descreverAgenda("30 8 1,15 * *")).toBe("Nos dias 1 e 15, às 08:30");
    expect(descreverAgenda("0 9,14 * * 6")).toBe("Todo sábado, às 09:00 e 14:00");
    expect(descreverAgenda("0 10 5 12 *")).toBe("No dia 5, em dezembro, às 10:00");
    expect(descreverAgenda("0 9 * * *")).toBe("Todo dia, às 09:00");
    expect(descreverAgenda("lixo")).toBe("");
  });

  it("no fluxo: espera até a agenda e segue; agenda inválida não publica", () => {
    const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({ id, type, position: { x: 0, y: 0 }, data });
    const liga = (s: string, t: string) => ({ id: `${s}-${t}`, source: s, target: t, sourceHandle: "proximo" });
    const grafo = (agenda: string) => ({
      nodes: [no("ini", "inicio_canal"), no("espera", "aguardar_ate", { quando: "agenda", agenda }), no("fim", "enviar_mensagem", { texto: "Chegou a hora." })],
      edges: [liga("ini", "espera"), liga("espera", "fim")],
    });
    const ctx = (d: Date) => ({ mensagem: null, agora: d, fuso: SP });
    const r = iniciarFluxo(grafo("0 9 * * 1-5") as never, "ini", ctx(agora));
    expect(r.sessao.status).toBe("waiting_timer");
    expect(emSP(new Date(r.sessao.retomar_em!))).toBe("2026-10-23 09:00");
    const depois = retomarFluxo(grafo("0 9 * * 1-5") as never, r.sessao, ctx(new Date(new Date(r.sessao.retomar_em!).getTime() + 5000)));
    expect(depois.efeitos).toEqual([{ tipo: "enviar", texto: "Chegou a hora." }]);
    expect(problemasDoGrafo(grafo("0 25 * * *") as never).join(" ")).toMatch(/hora/);
    expect(problemasDoGrafo(grafo("0 9 * * 1-5") as never)).toEqual([]);
  });
});
