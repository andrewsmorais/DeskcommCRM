/**
 * Auditoria funcional do chatbot (03/11/2026), consertos de 11/11/2026:
 *   - config fora do limite era DESCARTADA inteira em silêncio (uma opção de
 *     81 letras virava "Opção 1 / Opção 2"; 21 palavras-chave viravam "toda
 *     conversa nova" de qualquer número). Agora o excesso é aparado e o
 *     validador aponta o campo;
 *   - com dois inícios, vencia a ordem do array (invisível na tela). Agora a
 *     palavra-chave vence o "toda conversa nova", e início ilegível não atende;
 *   - o relógio de uma pergunta cujo prazo foi tirado acordava e encerrava a
 *     conversa calado. Agora a pergunta segue esperando;
 *   - "Pedir para escolher" pode guardar a escolha numa variável;
 *   - "Transferir p/ agentes de IA" leva o agente escolhido ao executor.
 */
import { describe, expect, it } from "vitest";

import {
  continuarFluxo,
  inicioQueAtende,
  iniciarFluxo,
  pontoDePartida,
  retomarFluxo,
  type ContextoDoTurno,
} from "./motor";
import { lerConfig, lerConfigOuNada, problemaDaConfig, type Grafo } from "./passos";
import { problemasDoGrafo } from "./validar";

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
const ctx = (mensagem: string | null): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-11-11T13:30:00Z"),
  fuso: "America/Sao_Paulo",
});
const NUMERO = "11111111-1111-4111-8111-111111111111";

describe("config fora do limite é aparada, não descartada", () => {
  it("opção de 81 letras: corta em 80 e mantém as outras opções e a pergunta", () => {
    const longa = "x".repeat(81);
    const c = lerConfig("pedir_escolher", {
      pergunta: "Qual?",
      opcoes: ["Comprar", longa, "Suporte"],
    });
    expect(c.pergunta).toBe("Qual?");
    expect(c.opcoes).toEqual(["Comprar", "x".repeat(80), "Suporte"]);
  });

  it("21 palavras-chave: fica com 20 e CONTINUA por palavra-chave (não vira 'pega tudo')", () => {
    const palavras = Array.from({ length: 21 }, (_, i) => `palavra${i}`);
    const c = lerConfig("inicio_canal", { gatilho: "palavra_chave", palavras });
    expect(c.gatilho).toBe("palavra_chave");
    expect(c.palavras).toHaveLength(20);
    const grafo: Grafo = {
      nodes: [no("ini", "inicio_canal", { gatilho: "palavra_chave", palavras })],
      edges: [],
    };
    expect(pontoDePartida(grafo, { channelSessionId: NUMERO, mensagem: "boa tarde" })).toBeNull();
    expect(pontoDePartida(grafo, { channelSessionId: NUMERO, mensagem: "palavra3" })).toBe("ini");
  });

  it("o validador aponta o campo e impede ligar", () => {
    const grafo: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("m", "pedir_escolher", { pergunta: "Qual?", opcoes: ["a", "y".repeat(81)] }),
      ],
      edges: [liga("ini", "m")],
    };
    expect(problemaDaConfig("pedir_escolher", grafo.nodes[1]!.data)).toEqual({
      campo: "opcoes",
      limite: 80,
    });
    expect(problemasDoGrafo(grafo).some((p) => p.includes("passou do limite (máximo 80)"))).toBe(
      true,
    );
  });

  it("controle: config válida não tem problema", () => {
    expect(
      problemaDaConfig("pedir_escolher", { pergunta: "Qual?", opcoes: ["a", "b"] }),
    ).toBeNull();
  });
});

describe("qual início atende", () => {
  it("palavra-chave vence o 'toda conversa nova' que vem antes no desenho", () => {
    const grafo: Grafo = {
      nodes: [
        no("geral", "inicio_canal"),
        no("chave", "inicio_canal", { gatilho: "palavra_chave", palavras: ["boleto"] }),
      ],
      edges: [],
    };
    expect(
      inicioQueAtende(grafo, { channelSessionId: NUMERO, mensagem: "2ª via do BOLETO" }),
    ).toEqual({ id: "chave", gatilho: "palavra_chave" });
    expect(inicioQueAtende(grafo, { channelSessionId: NUMERO, mensagem: "oi" })).toEqual({
      id: "geral",
      gatilho: "toda_conversa_nova",
    });
  });

  it("início com config ilegível não atende (o padrão dele pegaria tudo)", () => {
    const grafo: Grafo = {
      nodes: [no("ini", "inicio_canal", { channel_session_id: "nao-e-uuid" })],
      edges: [],
    };
    expect(lerConfigOuNada("inicio_canal", grafo.nodes[0]!.data)).toBeNull();
    expect(pontoDePartida(grafo, { channelSessionId: NUMERO, mensagem: "oi" })).toBeNull();
  });

  it("validador: dois 'toda conversa nova' no mesmo número, ou a mesma palavra em dois inícios", () => {
    const dois: Grafo = {
      nodes: [
        no("a", "inicio_canal"),
        no("b", "inicio_canal"),
        no("m", "enviar_mensagem", { texto: "oi" }),
      ],
      edges: [liga("a", "m"), liga("b", "m")],
    };
    expect(problemasDoGrafo(dois).some((p) => p.includes("só um atenderia"))).toBe(true);
    const repetida: Grafo = {
      nodes: [
        no("a", "inicio_canal", { gatilho: "palavra_chave", palavras: ["Preço"] }),
        no("b", "inicio_canal", { gatilho: "palavra_chave", palavras: ["preco", "frete"] }),
        no("m", "enviar_mensagem", { texto: "oi" }),
      ],
      edges: [liga("a", "m"), liga("b", "m")],
    };
    expect(problemasDoGrafo(repetida).some((p) => p.includes("está em dois"))).toBe(true);
  });

  it("controle: um geral e uma palavra-chave no mesmo número não conflitam", () => {
    const ok: Grafo = {
      nodes: [
        no("a", "inicio_canal"),
        no("b", "inicio_canal", { gatilho: "palavra_chave", palavras: ["menu"] }),
        no("m", "enviar_mensagem", { texto: "oi" }),
      ],
      edges: [liga("a", "m"), liga("b", "m")],
    };
    expect(problemasDoGrafo(ok)).toEqual([]);
  });
});

describe("relógio de pergunta cujo prazo foi tirado", () => {
  const pergunta = (prazo: number): Grafo => ({
    nodes: [
      no("ini", "inicio_canal"),
      no("p", "pedir_digitar", { pergunta: "Seu nome?", variavel: "nome", prazo_minutos: prazo }),
      no("fim", "enviar_mensagem", { texto: "Obrigado, {{nome}}!" }),
      no("sumiu", "enviar_mensagem", { texto: "Você sumiu." }),
    ],
    edges: [
      liga("ini", "p"),
      liga("p", "fim"),
      ...(prazo > 0 ? [liga("p", "sumiu", "sem_resposta")] : []),
    ],
  });

  it("sem prazo no desenho atual: a pergunta segue esperando, nada sai", () => {
    const parada = iniciarFluxo(pergunta(30), "ini", ctx("oi")).sessao;
    expect(parada.status).toBe("waiting_input");
    const r = retomarFluxo(pergunta(0), parada, ctx(null));
    expect(r.sessao.status).toBe("waiting_input");
    expect(r.sessao.no_atual).toBe("p");
    expect(r.efeitos).toEqual([]);
    // E a resposta que chega depois ainda é atendida.
    const depois = continuarFluxo(pergunta(0), r.sessao, ctx("Ana"));
    expect(depois.efeitos.some((e) => e.tipo === "enviar" && e.texto === "Obrigado, Ana!")).toBe(
      true,
    );
  });

  it("controle: com prazo, segue por 'Não respondeu a tempo'", () => {
    const parada = iniciarFluxo(pergunta(30), "ini", ctx("oi")).sessao;
    const r = retomarFluxo(pergunta(30), parada, ctx(null));
    expect(r.efeitos.some((e) => e.tipo === "enviar" && e.texto === "Você sumiu.")).toBe(true);
  });
});

describe("Pedir para escolher guarda a escolha", () => {
  const grafo = (variavel: string): Grafo => ({
    nodes: [
      no("ini", "inicio_canal"),
      no("m", "pedir_escolher", { pergunta: "Qual?", opcoes: ["Comprar", "Suporte"], variavel }),
      no("a", "enviar_mensagem", { texto: "Você escolheu: {{assunto}}" }),
      no("b", "enviar_mensagem", { texto: "Suporte: {{assunto}}" }),
    ],
    edges: [liga("ini", "m"), liga("m", "a", "opcao-0"), liga("m", "b", "opcao-1")],
  });

  it("com variável: o texto da opção vira {{assunto}}", () => {
    const parada = iniciarFluxo(grafo("assunto"), "ini", ctx("oi")).sessao;
    const r = continuarFluxo(grafo("assunto"), parada, ctx("2"));
    expect(r.efeitos).toContainEqual(
      expect.objectContaining({ tipo: "enviar", texto: "Suporte: Suporte" }),
    );
  });

  it("controle: sem variável, nada é guardado (como antes)", () => {
    const parada = iniciarFluxo(grafo(""), "ini", ctx("oi")).sessao;
    const r = continuarFluxo(grafo(""), parada, ctx("1"));
    expect(r.efeitos).toContainEqual(
      expect.objectContaining({ tipo: "enviar", texto: expect.stringMatching(/^Você escolheu:\s*$/) }),
    );
  });
});

describe("Transferir p/ agentes de IA com agente escolhido", () => {
  it("o pendente leva o agente ao executor", () => {
    const AGENTE = "22222222-2222-4222-8222-222222222222";
    const grafo: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("ia", "transferir_ia", { agent_id: AGENTE })],
      edges: [liga("ini", "ia")],
    };
    expect(iniciarFluxo(grafo, "ini", ctx("oi")).pendente).toEqual({
      tipo: "ia",
      no: "ia",
      agent_id: AGENTE,
    });
  });
});
