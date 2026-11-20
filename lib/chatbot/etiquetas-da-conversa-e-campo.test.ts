/**
 * Dois blocos da Umbler que faltavam (13/11/2026):
 *   - "Editar etiquetas" escolhe ONDE mexer: no contato ou na conversa;
 *   - "Campo do contato" como card próprio de CONDIÇÃO.
 * E a condição "Etiquetas" enxerga as duas caixas do marcador (contato e
 * conversa), como o filtro da Inbox.
 */
import { describe, expect, it } from "vitest";

import { iniciarFluxo, type ContextoDoTurno } from "./motor";
import { AJUDA_DOS_PASSOS } from "./ajuda-dos-passos";
import { PASSOS_AVANCADOS } from "./passos-avancados";
import { lerConfig, saidasDoPasso, type Grafo } from "./passos";
import { aplicarEtiquetas, contatoVazio, type ContatoDoTurno } from "./regras";
import { problemasDoGrafo } from "./validar";

const ctx = (contato: Partial<ContatoDoTurno> = {}): ContextoDoTurno => ({
  mensagem: "oi",
  agora: new Date("2026-11-13T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: { ...contatoVazio(), ...contato },
});
const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle = "proximo") => ({
  id: `${source}-${sourceHandle}`,
  source,
  target,
  sourceHandle,
});
const textos = (r: ReturnType<typeof iniciarFluxo>) =>
  r.efeitos.flatMap((e) => (e.tipo === "enviar" ? [e.texto] : []));

/** Editar etiquetas → condição "Etiquetas" → mensagem conforme o caminho. */
const grafoEtiquetas = (editar: Record<string, unknown>, condicao: Record<string, unknown>): Grafo => ({
  nodes: [
    no("i", "inicio_canal"),
    no("e", "editar_etiquetas", editar),
    no("c", "tem_etiqueta", condicao),
    no("s", "enviar_mensagem", { texto: "tem" }),
    no("n", "enviar_mensagem", { texto: "não tem" }),
  ],
  edges: [liga("i", "e"), liga("e", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
});

describe("Editar etiquetas — contato ou conversa", () => {
  it("na conversa: o efeito leva o alvo, e a condição seguinte já enxerga", () => {
    const r = iniciarFluxo(
      grafoEtiquetas({ alvo: "conversa", adicionar: ["Urgente"] }, { etiquetas: ["urgente"] }),
      "i",
      ctx(),
    );
    expect(r.efeitos[0]).toEqual({
      tipo: "etiquetas",
      alvo: "conversa",
      adicionar: ["Urgente"],
      remover: [],
    });
    expect(textos(r)).toEqual(["tem"]);
  });

  it("fluxo salvo antes da escolha (sem alvo) continua mexendo no contato", () => {
    expect(lerConfig("editar_etiquetas", { adicionar: ["vip"] }).alvo).toBe("contato");
    const r = iniciarFluxo(
      grafoEtiquetas({ adicionar: ["vip"] }, { etiquetas: ["vip"] }),
      "i",
      ctx(),
    );
    expect(r.efeitos[0]).toMatchObject({ tipo: "etiquetas", alvo: "contato" });
    expect(textos(r)).toEqual(["tem"]);
  });

  it("remover da conversa não tira a etiqueta do contato (são caixas separadas)", () => {
    const r = iniciarFluxo(
      grafoEtiquetas({ alvo: "conversa", remover: ["vip"] }, { etiquetas: ["vip"] }),
      "i",
      ctx({ tags: ["vip"], tags_da_conversa: ["vip"] }),
    );
    // O contato ainda tem "vip": a condição segue por "Tem".
    expect(textos(r)).toEqual(["tem"]);
  });

  it("a condição Etiquetas enxerga a etiqueta que a conversa já tinha", () => {
    const grafo: Grafo = {
      nodes: [
        no("i", "inicio_canal"),
        no("c", "tem_etiqueta", { etiquetas: ["Retorno"], modo: "todas" }),
        no("s", "enviar_mensagem", { texto: "tem" }),
        no("n", "enviar_mensagem", { texto: "não tem" }),
      ],
      edges: [liga("i", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
    };
    expect(textos(iniciarFluxo(grafo, "i", ctx({ tags_da_conversa: ["retorno"] })))).toEqual(["tem"]);
    expect(textos(iniciarFluxo(grafo, "i", ctx()))).toEqual(["não tem"]);
  });

  it("a regra de etiqueta do Definir condição também olha a conversa", () => {
    const grafo: Grafo = {
      nodes: [
        no("i", "inicio_canal"),
        no("c", "definir_condicao", { regra: { fonte: "etiqueta", operador: "tem", valor: "retorno" } }),
        no("s", "enviar_mensagem", { texto: "atendida" }),
        no("n", "enviar_mensagem", { texto: "não atendida" }),
      ],
      edges: [liga("i", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
    };
    expect(textos(iniciarFluxo(grafo, "i", ctx({ tags_da_conversa: ["retorno"] })))).toEqual([
      "atendida",
    ]);
  });

  it("aplicarEtiquetas: remove e adiciona sem repetir, ignorando maiúsculas e acentos", () => {
    expect(aplicarEtiquetas(["Vip", "novo"], ["VIP", "Promoção"], ["NOVO"])).toEqual(["Vip", "Promoção"]);
  });
});

describe('Condição "Campo do contato"', () => {
  const grafo = (regra: Record<string, unknown>): Grafo => ({
    nodes: [
      no("i", "inicio_canal"),
      no("c", "condicao_campo_contato", { regra }),
      no("s", "enviar_mensagem", { texto: "atendida" }),
      no("n", "enviar_mensagem", { texto: "não atendida" }),
    ],
    edges: [liga("i", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
  });

  it("e-mail preenchido segue por Regra atendida; vazio, por Regra não atendida", () => {
    const g = grafo({ chave: "email", operador: "preenchido" });
    expect(textos(iniciarFluxo(g, "i", ctx({ email: "ana@exemplo.com" })))).toEqual(["atendida"]);
    expect(textos(iniciarFluxo(g, "i", ctx()))).toEqual(["não atendida"]);
  });

  it("compara campo personalizado (maiúsculas e acentos não importam)", () => {
    const g = grafo({ chave: "cidade", operador: "igual", valor: "São Paulo" });
    expect(textos(iniciarFluxo(g, "i", ctx({ personalizados: { cidade: "SAO PAULO" } })))).toEqual([
      "atendida",
    ]);
  });

  it("a fonte é sempre o campo do contato, mesmo num desenho editado à mão", () => {
    // Com fonte "etiqueta", a regra olharia a etiqueta "vip"; o card força o campo.
    const g = grafo({ fonte: "etiqueta", chave: "nome", operador: "igual", valor: "vip" });
    expect(textos(iniciarFluxo(g, "i", ctx({ tags: ["vip"], nome: "Ana" })))).toEqual([
      "não atendida",
    ]);
  });

  it("nasce olhando o nome, com as saídas do Definir condição", () => {
    const c = lerConfig("condicao_campo_contato", {});
    expect(c.regra).toMatchObject({ fonte: "campo_contato", chave: "nome", operador: "preenchido" });
    expect(saidasDoPasso("condicao_campo_contato", {}).map((s) => s.id)).toEqual(["sim", "nao"]);
  });

  it("não liga sem o valor a comparar", () => {
    const problemas = problemasDoGrafo(grafo({ chave: "email", operador: "igual", valor: "" }));
    expect(problemas.some((p) => p.includes("escreva o valor para comparar"))).toBe(true);
  });

  it("é passo do chatbot avançado (diamante na Umbler) e tem texto de ajuda", () => {
    expect(PASSOS_AVANCADOS.has("condicao_campo_contato")).toBe(true);
    expect(AJUDA_DOS_PASSOS.condicao_campo_contato).toContain("campo do cadastro do contato");
  });
});

describe('Ação "Visibilidade da conversa"', () => {
  const grafo = (dados: Record<string, unknown>): Grafo => ({
    nodes: [no("i", "inicio_canal"), no("v", "visibilidade_conversa", dados)],
    edges: [liga("i", "v")],
  });

  it("nasce ocultando, e cada opção vira o efeito com a mesma visibilidade", () => {
    expect(lerConfig("visibilidade_conversa", {}).visibilidade).toBe("oculta");
    for (const v of ["visivel", "oculta", "oculta_ate_mensagem"] as const) {
      const r = iniciarFluxo(grafo({ visibilidade: v }), "i", ctx());
      expect(r.efeitos).toContainEqual({ tipo: "visibilidade", visibilidade: v });
    }
  });

  it("é passo do chatbot avançado (diamante na Umbler) e tem texto de ajuda", () => {
    expect(PASSOS_AVANCADOS.has("visibilidade_conversa")).toBe(true);
    expect(AJUDA_DOS_PASSOS.visibilidade_conversa).toContain("Ocultas");
  });
});
