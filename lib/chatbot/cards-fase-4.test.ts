/**
 * Os seis cards que faltavam na auditoria dos 60 (docs/audits/2026-11-03-…),
 * no motor PURO: Etapa do funil, Enviar localização, Enviar contato, Enviar
 * produto, Cancelar agendamento e Reagendar horário. O que toca banco, Agenda
 * e Catálogo é do executor.
 */
import { describe, expect, it } from "vitest";

import {
  CHAVE_DO_AGENDAMENTO,
  continuarAposCancelar,
  continuarComHorarios,
  continuarFluxo,
  fatosVazios,
  iniciarFluxo,
  textoDaLocalizacao,
  type ContextoDoTurno,
  type FatosDaConversa,
} from "./motor";
import { lerConfig, saidasDoPasso, type Grafo } from "./passos";
import { contatoVazio } from "./regras";
import { problemasDoGrafo } from "./validar";

const FUNIL = "11111111-1111-4111-8111-111111111111";
const ETAPA = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";
const PRODUTO = "44444444-4444-4444-8444-444444444444";

const ctx = (mensagem: string | null, conversa?: Partial<FatosDaConversa>): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
  conversa: { ...fatosVazios(), ...conversa },
});
const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const msg = (id: string, texto: string) => no(id, "enviar_mensagem", { texto });
const liga = (source: string, target: string, sourceHandle = "proximo") => ({
  id: `${source}-${sourceHandle}`,
  source,
  target,
  sourceHandle,
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

describe("Etapa do funil", () => {
  const g = (data: Record<string, unknown>): Grafo => ({
    nodes: [
      no("i", "inicio_canal"),
      no("c", "etapa_do_funil", data),
      msg("s", "sim"),
      msg("n", "nao"),
    ],
    edges: [liga("i", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
  });

  it("negócio aberto no funil (qualquer etapa) segue por Está", () => {
    const r = iniciarFluxo(
      g({ pipeline_id: FUNIL }),
      "i",
      ctx("oi", { negocios: [{ funil: FUNIL, etapa: OUTRA }] }),
    );
    expect(textos(r.efeitos)).toEqual(["sim"]);
  });

  it("com etapas marcadas, só nelas; sem negócio, Não está", () => {
    const marcada = g({ pipeline_id: FUNIL, etapas: [ETAPA] });
    expect(
      textos(
        iniciarFluxo(marcada, "i", ctx("oi", { negocios: [{ funil: FUNIL, etapa: OUTRA }] }))
          .efeitos,
      ),
    ).toEqual(["nao"]);
    expect(
      textos(
        iniciarFluxo(marcada, "i", ctx("oi", { negocios: [{ funil: FUNIL, etapa: ETAPA }] }))
          .efeitos,
      ),
    ).toEqual(["sim"]);
    expect(textos(iniciarFluxo(marcada, "i", ctx("oi")).efeitos)).toEqual(["nao"]);
  });
});

describe("Enviar localização, contato e produto", () => {
  it("localização vira texto com o link do mapa; coordenadas mandam no ponto exato", () => {
    const c = lerConfig("enviar_localizacao", {
      nome: "Loja Centro",
      endereco: "Rua A, 10",
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(textoDaLocalizacao(c, {})).toBe(
      "📍 *Loja Centro*\nRua A, 10\nhttps://www.google.com/maps/search/?api=1&query=-23.55,-46.63",
    );
    const soEndereco = lerConfig("enviar_localizacao", { endereco: "Rua B, 5" });
    expect(textoDaLocalizacao(soEndereco, {})).toContain("query=Rua%20B%2C%205");
    expect(textoDaLocalizacao(lerConfig("enviar_localizacao", {}), {})).toBe("");
  });

  it("contato e produto viram efeitos para o executor", () => {
    const g: Grafo = {
      nodes: [
        no("i", "inicio_canal"),
        no("c", "enviar_contato", { nome: "Financeiro", telefone: "11987654321" }),
        no("p", "enviar_produto", { produto_id: PRODUTO, mensagem: "Olha este:" }),
      ],
      edges: [liga("i", "c"), liga("c", "p")],
    };
    expect(iniciarFluxo(g, "i", ctx("oi")).efeitos).toEqual([
      { tipo: "contato", nome: "Financeiro", telefone: "11987654321" },
      { tipo: "produto", produto_id: PRODUTO, mensagem: "Olha este:" },
    ]);
  });

  it("validação pede endereço, telefone com DDD, produto e funil", () => {
    const g: Grafo = {
      nodes: [
        no("i", "inicio_canal"),
        no("l", "enviar_localizacao"),
        no("c", "enviar_contato", { nome: "X", telefone: "1234" }),
        no("p", "enviar_produto"),
        no("f", "etapa_do_funil"),
      ],
      edges: [liga("i", "l"), liga("l", "c"), liga("c", "p"), liga("p", "f")],
    };
    const p = problemasDoGrafo(g).join(" | ");
    expect(p).toMatch(/endereço/);
    expect(p).toMatch(/telefone com DDD/);
    expect(p).toMatch(/escolha o produto/);
    expect(p).toMatch(/escolha o funil/);
  });
});

describe("Cancelar agendamento", () => {
  const g: Grafo = {
    nodes: [
      no("i", "inicio_canal"),
      no("x", "cancelar_agendamento"),
      msg("ok", "Cancelei seu horário de {{agendamento}}."),
      msg("sem", "Não achei horário marcado."),
    ],
    edges: [liga("i", "x"), liga("x", "ok"), liga("x", "sem", "sem_agendamento")],
  };

  it("para no executor e segue pelo desfecho, com o horário em {{agendamento}}", () => {
    const r = iniciarFluxo(g, "i", ctx("cancelar"));
    expect(r.pendente).toEqual({ tipo: "cancelar", no: "x" });
    const ok = continuarAposCancelar(g, r.sessao, "cancelado", "ter 04/11 às 14:00", ctx(null));
    expect(textos(ok.efeitos)).toEqual(["Cancelei seu horário de ter 04/11 às 14:00."]);
    const sem = continuarAposCancelar(g, r.sessao, "sem_agendamento", null, ctx(null));
    expect(textos(sem.efeitos)).toEqual(["Não achei horário marcado."]);
    // "Não cancelou" sem ligação encerra — não segue pelo caminho do sucesso.
    const falhou = continuarAposCancelar(g, r.sessao, "falha", null, ctx(null));
    expect(falhou.efeitos).toEqual([]);
    expect(falhou.sessao.status).toBe("completed");
  });
});

describe("Reagendar horário", () => {
  const g: Grafo = {
    nodes: [
      no("i", "inicio_canal"),
      no("r", "reagendar_horario"),
      msg("sem", "Você não tem horário marcado."),
    ],
    edges: [liga("i", "r"), liga("r", "sem", "sem_agendamento")],
  };

  it("sem compromisso futuro segue por Sem agendamento", () => {
    const r = iniciarFluxo(g, "i", ctx("remarcar"));
    expect(r.pendente).toEqual({ tipo: "horarios", no: "r" });
    const sem = continuarComHorarios(g, r.sessao, [], ctx(null), { semAgendamento: true });
    expect(textos(sem.efeitos)).toEqual(["Você não tem horário marcado."]);
  });

  it("oferece os horários e a escolha leva o compromisso a mudar (não a nascer outro)", () => {
    const r = iniciarFluxo(g, "i", ctx("remarcar"));
    const ofertas = [
      { inicio: "2026-11-05T13:00:00.000Z", quando: "qui 05/11 às 10:00" },
      { inicio: "2026-11-05T14:00:00.000Z", quando: "qui 05/11 às 11:00" },
    ];
    const oferecido = continuarComHorarios(g, r.sessao, ofertas, ctx(null), {
      dados: { [CHAVE_DO_AGENDAMENTO]: "ag-1", agendamento_anterior: "ter 04/11 às 14:00" },
    });
    expect(textos(oferecido.efeitos)[0]).toMatch(/Para qual horário você quer mudar\?/);
    const escolheu = continuarFluxo(g, oferecido.sessao, ctx("2"));
    expect(escolheu.pendente).toEqual({
      tipo: "marcar",
      no: "r",
      inicio: "2026-11-05T14:00:00.000Z",
      agendamento_id: "ag-1",
    });
  });

  it("saídas próprias de cada card", () => {
    expect(saidasDoPasso("reagendar_horario", {}).map((s) => s.id)).toEqual([
      "proximo",
      "sem_agendamento",
      "sem_horario",
      "invalida",
    ]);
    expect(saidasDoPasso("cancelar_agendamento", {}).map((s) => s.id)).toEqual([
      "proximo",
      "sem_agendamento",
      "falha",
    ]);
    expect(saidasDoPasso("etapa_do_funil", {}).map((s) => s.id)).toEqual(["sim", "nao"]);
  });
});
