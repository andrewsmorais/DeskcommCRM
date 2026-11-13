/**
 * Etiqueta de origem do "Iniciar por um canal": a frase da mensagem que abriu
 * a conversa vira etiqueta do contato — e a condição "Etiquetas" logo depois
 * já enxerga a etiqueta nova.
 */
import { describe, expect, it } from "vitest";

import { iniciarFluxo, type ContextoDoTurno } from "./motor";
import { lerConfig, type Grafo } from "./passos";
import { contatoVazio } from "./regras";

const ctx = (mensagem: string | null, tags: string[] = []): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: { ...contatoVazio(), tags },
});

const grafo: Grafo = {
  nodes: [
    {
      id: "i",
      type: "inicio_canal",
      position: { x: 0, y: 0 },
      data: {
        origens: [
          { frase: "vi no Instagram", etiqueta: "instagram" },
          { frase: "anúncio do Google", etiqueta: "google" },
        ],
      },
    },
    {
      id: "c",
      type: "tem_etiqueta",
      position: { x: 0, y: 0 },
      data: { etiquetas: ["instagram"] },
    },
    { id: "sim", type: "enviar_mensagem", position: { x: 0, y: 0 }, data: { texto: "Do Insta!" } },
    { id: "nao", type: "enviar_mensagem", position: { x: 0, y: 0 }, data: { texto: "Olá!" } },
  ],
  edges: [
    { id: "a", source: "i", target: "c", sourceHandle: "proximo" },
    { id: "b", source: "c", target: "sim", sourceHandle: "sim" },
    { id: "d", source: "c", target: "nao", sourceHandle: "nao" },
  ],
};

describe("etiqueta de origem", () => {
  it("a frase da primeira mensagem vira etiqueta (maiúsculas e acentos não importam)", () => {
    const r = iniciarFluxo(grafo, "i", ctx("Oi! VI NO INSTAGRAM o anuncio"));
    expect(r.efeitos[0]).toEqual({ tipo: "etiquetas", alvo: "contato", adicionar: ["instagram"], remover: [] });
    expect(r.efeitos.at(-1)).toEqual({ tipo: "enviar", texto: "Do Insta!" });
  });

  it("sem a frase, nenhuma etiqueta; contato que já tem a etiqueta não ganha de novo", () => {
    expect(iniciarFluxo(grafo, "i", ctx("bom dia")).efeitos.map((e) => e.tipo)).toEqual(["enviar"]);
    const r = iniciarFluxo(grafo, "i", ctx("vi no instagram", ["Instagram"]));
    expect(r.efeitos.some((e) => e.tipo === "etiquetas")).toBe(false);
  });

  it("fluxo salvo antes não tem origens", () => {
    expect(lerConfig("inicio_canal", {}).origens).toEqual([]);
  });
});
