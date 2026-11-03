/**
 * Prazo de resposta no Enviar formulário (vale para CADA pergunta) e no
 * Agendar/Reagendar horário (conta a partir da lista de horários). O relógio
 * vencido segue por "Não respondeu a tempo", as respostas já dadas ficam, e o
 * estado da pergunta que venceu sai da sessão.
 */
import { describe, expect, it } from "vitest";

import {
  CHAVE_DO_FORMULARIO,
  CHAVE_DOS_HORARIOS,
  continuarComHorarios,
  continuarFluxo,
  iniciarFluxo,
  retomarFluxo,
  type ContextoDoTurno,
  type OfertaDeHorario,
} from "./motor";
import { saidasDoPasso, type Grafo } from "./passos";
import { contatoVazio } from "./regras";

const AGORA = new Date("2026-11-03T13:00:00Z");
const depois = (min: number) => new Date(AGORA.getTime() + min * 60_000).toISOString();
const ctx = (mensagem: string | null, agora = AGORA): ContextoDoTurno => ({
  mensagem,
  agora,
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);
const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle = "proximo") => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  target,
  sourceHandle,
});

describe("Enviar formulário com prazo", () => {
  const g = (prazo: number): Grafo => ({
    nodes: [
      no("i", "inicio_canal"),
      no("f", "enviar_formulario", {
        prazo_minutos: prazo,
        perguntas: [
          { pergunta: "Seu nome?", variavel: "nome" },
          { pergunta: "Seu e-mail?", variavel: "email", tipo: "email" },
        ],
      }),
      no("ok", "enviar_mensagem", { texto: "Obrigado, {{nome}}." }),
      no("lembrete", "enviar_mensagem", {
        texto: "Parou no meio, {{nome}}? Quando puder, me chama.",
      }),
    ],
    edges: [liga("i", "f"), liga("f", "ok"), liga("f", "lembrete", "sem_resposta")],
  });

  it("a saída só aparece com prazo", () => {
    expect(saidasDoPasso("enviar_formulario", { prazo_minutos: 30 }).map((s) => s.id)).toContain(
      "sem_resposta",
    );
    expect(saidasDoPasso("enviar_formulario", {}).map((s) => s.id)).not.toContain("sem_resposta");
  });

  it("o relógio vale para cada pergunta e recomeça na seguinte", () => {
    const r = iniciarFluxo(g(30), "i", ctx("oi"));
    expect(r.sessao).toMatchObject({
      status: "waiting_input",
      no_atual: "f",
      retomar_em: depois(30),
    });

    const meio = new Date(AGORA.getTime() + 20 * 60_000);
    const r2 = continuarFluxo(g(30), r.sessao, ctx("Ana", meio));
    expect(textos(r2.efeitos)).toEqual(["Seu e-mail?"]);
    expect(r2.sessao.retomar_em).toBe(new Date(meio.getTime() + 30 * 60_000).toISOString());
  });

  it("vencido no meio: segue por Não respondeu a tempo, guarda o que já veio e limpa a posição", () => {
    const r = iniciarFluxo(g(30), "i", ctx("oi"));
    const r2 = continuarFluxo(g(30), r.sessao, ctx("Ana"));
    const venceu = retomarFluxo(g(30), r2.sessao, ctx(null));
    expect(textos(venceu.efeitos)).toEqual(["Parou no meio, Ana? Quando puder, me chama."]);
    expect(venceu.sessao.dados.nome).toBe("Ana");
    expect(venceu.sessao.dados[CHAVE_DO_FORMULARIO]).toBeUndefined();
  });

  it("sem prazo: espera sem relógio, como antes", () => {
    const r = iniciarFluxo(g(0), "i", ctx("oi"));
    expect(r.sessao).toMatchObject({ status: "waiting_input", retomar_em: null });
  });

  it("vencido sem nada ligado: o fluxo termina", () => {
    const sem: Grafo = {
      ...g(30),
      edges: g(30).edges.filter((e) => e.sourceHandle !== "sem_resposta"),
    };
    const r = iniciarFluxo(sem, "i", ctx("oi"));
    const venceu = retomarFluxo(sem, r.sessao, ctx(null));
    expect(venceu.sessao.status).toBe("completed");
    expect(venceu.efeitos).toEqual([]);
  });
});

const OFERTAS: OfertaDeHorario[] = [
  { inicio: "2026-11-05T12:00:00.000Z", quando: "quinta-feira 05/11 às 09:00" },
  { inicio: "2026-11-05T17:00:00.000Z", quando: "quinta-feira 05/11 às 14:00" },
];

describe.each(["agendar_horario", "reagendar_horario"] as const)("%s com prazo", (tipo) => {
  const g = (prazo: number): Grafo => ({
    nodes: [
      no("i", "inicio_canal"),
      no("ag", tipo, {
        event_type_id: "55555555-5555-4555-8555-555555555555",
        prazo_minutos: prazo,
        tentativas: 2,
      }),
      no("ok", "enviar_mensagem", { texto: "Marcado." }),
      no("lembrete", "enviar_mensagem", {
        texto: "Quer que eu guarde um horário? É só me chamar.",
      }),
    ],
    edges: [liga("i", "ag"), liga("ag", "ok"), liga("ag", "lembrete", "sem_resposta")],
  });

  it("a saída só aparece com prazo", () => {
    expect(saidasDoPasso(tipo, { prazo_minutos: 60 }).map((s) => s.id)).toContain("sem_resposta");
    expect(saidasDoPasso(tipo, {}).map((s) => s.id)).not.toContain("sem_resposta");
  });

  it("o relógio começa quando a lista sai, e de novo a cada pedido de novo", () => {
    const r = iniciarFluxo(g(60), "i", ctx("oi"));
    expect(r.sessao.retomar_em ?? null).toBeNull(); // ainda buscando os horários
    const lista = continuarComHorarios(g(60), r.sessao, OFERTAS, ctx(null));
    expect(lista.sessao).toMatchObject({ status: "waiting_input", retomar_em: depois(60) });

    const errou = continuarFluxo(g(60), lista.sessao, ctx("amanhã"));
    expect(errou.sessao).toMatchObject({ status: "waiting_input", retomar_em: depois(60) });
  });

  it("vencido: segue por Não respondeu a tempo, nada é marcado e os horários saem da sessão", () => {
    const r = iniciarFluxo(g(60), "i", ctx("oi"));
    const lista = continuarComHorarios(g(60), r.sessao, OFERTAS, ctx(null));
    const venceu = retomarFluxo(g(60), lista.sessao, ctx(null));
    expect(textos(venceu.efeitos)).toEqual(["Quer que eu guarde um horário? É só me chamar."]);
    expect(venceu.pendente).toBeUndefined();
    expect(venceu.sessao.dados[CHAVE_DOS_HORARIOS]).toBeUndefined();
  });

  it("sem prazo: a lista espera sem relógio", () => {
    const r = iniciarFluxo(g(0), "i", ctx("oi"));
    const lista = continuarComHorarios(g(0), r.sessao, OFERTAS, ctx(null));
    expect(lista.sessao.retomar_em).toBeNull();
  });
});
