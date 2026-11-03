/**
 * "Cliente não respondeu": a pergunta com prazo arma o relógio ao esperar; o
 * relógio vencido segue por "Não respondeu a tempo"; a resposta antes do prazo
 * desarma e segue normal. Pergunta sem prazo espera como antes.
 */
import { describe, expect, it } from "vitest";

import { continuarFluxo, iniciarFluxo, retomarFluxo, type ContextoDoTurno } from "./motor";
import { saidasDoPasso, type Grafo } from "./passos";
import { contatoVazio } from "./regras";

const AGORA = new Date("2026-11-03T13:00:00Z");
const ctx = (mensagem: string | null): ContextoDoTurno => ({
  mensagem,
  agora: AGORA,
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

const grafo = (tipo: "pedir_escolher" | "pedir_digitar", prazo: number): Grafo => ({
  nodes: [
    { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    {
      id: "p",
      type: tipo,
      position: { x: 0, y: 0 },
      data:
        tipo === "pedir_escolher"
          ? { pergunta: "Posso ajudar?", opcoes: ["Sim", "Não"], prazo_minutos: prazo }
          : { pergunta: "Seu nome?", variavel: "nome", prazo_minutos: prazo },
    },
    { id: "ok", type: "enviar_mensagem", position: { x: 0, y: 0 }, data: { texto: "Respondeu" } },
    {
      id: "lembrete",
      type: "enviar_mensagem",
      position: { x: 0, y: 0 },
      data: { texto: "Ainda está aí?" },
    },
  ],
  edges: [
    { id: "a", source: "i", target: "p", sourceHandle: "proximo" },
    {
      id: "b",
      source: "p",
      target: "ok",
      sourceHandle: tipo === "pedir_escolher" ? "opcao-0" : "proximo",
    },
    { id: "c", source: "p", target: "lembrete", sourceHandle: "sem_resposta" },
  ],
});

describe("prazo da resposta", () => {
  it.each(["pedir_escolher", "pedir_digitar"] as const)(
    "%s: com prazo, espera com o relógio armado e ganha a saída",
    (tipo) => {
      const r = iniciarFluxo(grafo(tipo, 30), "i", ctx("oi"));
      expect(r.sessao).toMatchObject({ status: "waiting_input", no_atual: "p" });
      expect(r.sessao.retomar_em).toBe(new Date(AGORA.getTime() + 30 * 60_000).toISOString());
      expect(saidasDoPasso(tipo, { prazo_minutos: 30 }).map((s) => s.id)).toContain("sem_resposta");
      expect(saidasDoPasso(tipo, {}).map((s) => s.id)).not.toContain("sem_resposta");
    },
  );

  it.each(["pedir_escolher", "pedir_digitar"] as const)(
    "%s: relógio vencido segue por Não respondeu a tempo",
    (tipo) => {
      const g = grafo(tipo, 30);
      const r = iniciarFluxo(g, "i", ctx("oi"));
      const venceu = retomarFluxo(g, r.sessao, ctx(null));
      expect(textos(venceu.efeitos)).toEqual(["Ainda está aí?"]);
      expect(venceu.sessao.status).toBe("completed");
    },
  );

  it("resposta antes do prazo desarma o relógio e segue normal", () => {
    const g = grafo("pedir_escolher", 30);
    const r = iniciarFluxo(g, "i", ctx("oi"));
    const respondeu = continuarFluxo(g, r.sessao, ctx("1"));
    expect(textos(respondeu.efeitos)).toEqual(["Respondeu"]);
    expect(respondeu.sessao.retomar_em ?? null).toBeNull();
  });

  it("resposta errada pergunta de novo e rearma o prazo", () => {
    const g = grafo("pedir_escolher", 15);
    const r = iniciarFluxo(g, "i", ctx("oi"));
    const errou = continuarFluxo(g, r.sessao, ctx("talvez"));
    expect(errou.sessao.status).toBe("waiting_input");
    expect(errou.sessao.retomar_em).toBe(new Date(AGORA.getTime() + 15 * 60_000).toISOString());
  });

  it("sem prazo: espera sem relógio, como antes; saída sem ligação encerra", () => {
    const sem = iniciarFluxo(grafo("pedir_digitar", 0), "i", ctx("oi"));
    expect(sem.sessao.retomar_em ?? null).toBeNull();
    const g = grafo("pedir_digitar", 10);
    g.edges = g.edges.filter((e) => e.sourceHandle !== "sem_resposta");
    const r = iniciarFluxo(g, "i", ctx("oi"));
    const venceu = retomarFluxo(g, r.sessao, ctx(null));
    expect(venceu.efeitos).toEqual([]);
    expect(venceu.sessao.status).toBe("completed");
  });
});
