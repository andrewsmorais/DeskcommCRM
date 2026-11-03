/**
 * "Transferir p/ atendente" com os 4 modos da Umbler (específico, rodízio,
 * menos conversas abertas, quem atendeu antes) — a parte PURA: a escolha entre
 * candidatos, o efeito que o motor emite, a validação e o fluxo salvo antes dos
 * modos. A resolução contra o banco está em
 * tests/invariants/chatbot-transferir-atendente-modos.test.ts.
 */
import { describe, expect, it } from "vitest";

import type { RoutingCandidate } from "@/lib/routing/decide";

import { escolherAtendente, notaSemAtendente } from "./atendente-do-passo";
import { iniciarFluxo, type ContextoDoTurno } from "./motor";
import { lerConfig, MODOS_DE_ATENDENTE, type Grafo } from "./passos";
import { contatoVazio } from "./regras";
import { problemasDoGrafo } from "./validar";

const ANA = "aaaaaaaa-0000-4000-8000-000000000001";
const BETO = "bbbbbbbb-0000-4000-8000-000000000002";
const CAIO = "cccccccc-0000-4000-8000-000000000003";

const candidato = (userId: string, currentLoad: number, lastAssignedAt: number | null) =>
  ({ userId, currentLoad, lastAssignedAt }) satisfies RoutingCandidate;

describe("quem recebe no rodízio e em menos conversas", () => {
  const equipe = [candidato(ANA, 3, 3000), candidato(BETO, 1, 1000), candidato(CAIO, 1, null)];

  it("rodízio: quem nunca recebeu vem primeiro; depois, quem recebeu há mais tempo", () => {
    expect(escolherAtendente("rodizio", equipe, [])).toBe(CAIO);
    expect(escolherAtendente("rodizio", equipe.slice(0, 2), [])).toBe(BETO);
  });

  it("menos conversas: a menor carga; empate desempata pelo rodízio", () => {
    expect(escolherAtendente("menos_conversas", equipe, [])).toBe(CAIO);
    expect(
      escolherAtendente("menos_conversas", [candidato(ANA, 0, 5000), candidato(BETO, 2, null)], []),
    ).toBe(ANA);
  });

  it("a lista do passo restringe; quem não está disponível não entra mesmo marcado", () => {
    expect(escolherAtendente("rodizio", equipe, [ANA, BETO])).toBe(BETO);
    expect(escolherAtendente("rodizio", [candidato(ANA, 0, null)], [BETO])).toBeNull();
  });

  it("ninguém disponível: null (a conversa vai para a fila)", () => {
    expect(escolherAtendente("rodizio", [], [])).toBeNull();
    expect(escolherAtendente("menos_conversas", [], [ANA])).toBeNull();
  });

  it("todo modo tem a nota que explica a ida para a fila", () => {
    for (const m of MODOS_DE_ATENDENTE) expect(notaSemAtendente(m)).toMatch(/fila de atendimento/);
  });
});

const ctx: ContextoDoTurno = {
  mensagem: "oi",
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
};
const grafoCom = (data: Record<string, unknown>): Grafo => ({
  nodes: [
    { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    { id: "t", type: "transferir_atendente", position: { x: 0, y: 0 }, data },
  ],
  edges: [{ id: "i-t", source: "i", target: "t", sourceHandle: "proximo" }],
});
const efeitoDe = (data: Record<string, unknown>) =>
  iniciarFluxo(grafoCom(data), "i", { ...ctx, contato: contatoVazio() }, {}).efeitos.find(
    (e) => e.tipo === "transferir_atendente",
  );

describe("o efeito do passo", () => {
  it("fluxo salvo antes dos modos segue como atendente específico", () => {
    expect(lerConfig("transferir_atendente", { user_id: ANA }).modo).toBe("especifico");
    expect(efeitoDe({ user_id: ANA })).toEqual({
      tipo: "transferir_atendente",
      modo: "especifico",
      user_id: ANA,
      atendentes: [],
    });
  });

  it("rodízio leva a lista e não leva o atendente fixo que sobrou na configuração", () => {
    expect(efeitoDe({ modo: "rodizio", user_id: ANA, atendentes: [BETO, CAIO] })).toEqual({
      tipo: "transferir_atendente",
      modo: "rodizio",
      user_id: null,
      atendentes: [BETO, CAIO],
    });
  });

  it("quem atendeu antes não leva lista nem atendente", () => {
    expect(efeitoDe({ modo: "anterior", user_id: ANA, atendentes: [BETO] })).toMatchObject({
      modo: "anterior",
      user_id: null,
      atendentes: [],
    });
  });
});

describe("validação", () => {
  it("só o modo específico exige escolher o atendente", () => {
    const sem = problemasDoGrafo(grafoCom({ modo: "especifico" }));
    expect(sem.some((p) => p.includes("escolha o atendente"))).toBe(true);
    for (const modo of ["rodizio", "menos_conversas", "anterior"]) {
      const ok = problemasDoGrafo(grafoCom({ modo }));
      expect(ok.some((p) => p.includes("escolha o atendente"))).toBe(false);
    }
  });
});
