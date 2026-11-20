import { describe, expect, it } from "vitest";

import { continuarFluxo, iniciarFluxo, type ContextoDoTurno } from "./motor";
import { saidasDoPasso, type Grafo, type Regra } from "./passos";
import { problemasDoGrafo } from "./validar";
import {
  contatoVazio,
  descreverRegra,
  problemaDaRegra,
  regraVale,
  valorDoCampo,
  type ContatoDoTurno,
} from "./regras";

const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle: string | null = "proximo") => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  target,
  sourceHandle,
});
const contato = (over: Partial<ContatoDoTurno> = {}): ContatoDoTurno => ({
  ...contatoVazio(),
  ...over,
});
const ctx = (mensagem: string | null, c: ContatoDoTurno = contato()): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-10-22T13:30:00Z"),
  fuso: "America/Sao_Paulo",
  contato: c,
});
const regra = (r: Partial<Regra>): Regra => ({
  fonte: "etiqueta",
  chave: "",
  operador: "tem",
  valor: "",
  rotulo: "",
  ...r,
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

describe("Campo do contato", () => {
  /** Pergunta o e-mail, grava, e pede de novo quando não é e-mail. */
  const pedeEmail: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("pergunta", "pedir_digitar", { pergunta: "Qual o seu e-mail?", variavel: "email" }),
      no("grava", "campo_contato", { campo: "email", valor: "{{email}}" }),
      no("ok", "enviar_mensagem", { texto: "Anotado: {{email}}" }),
      no("erro", "enviar_mensagem", { texto: "Esse e-mail não parece certo." }),
    ],
    edges: [
      liga("ini", "pergunta"),
      liga("pergunta", "grava"),
      liga("grava", "ok", "proximo"),
      liga("grava", "erro", "invalido"),
      liga("erro", "pergunta"),
    ],
  };

  it("e-mail válido é gravado (em minúsculas) e segue por Gravado", () => {
    const parado = iniciarFluxo(pedeEmail, "ini", ctx("oi")).sessao;
    const r = continuarFluxo(pedeEmail, parado, ctx(" Maria@Exemplo.COM "));
    expect(r.efeitos).toContainEqual({
      tipo: "campo_contato",
      campo: "email",
      chave: "",
      valor: "maria@exemplo.com",
    });
    expect(textos(r.efeitos)).toEqual(["Anotado: Maria@Exemplo.COM"]);
    expect(r.sessao.status).toBe("completed");
  });

  it("e-mail inválido não grava nada, avisa e pergunta de novo", () => {
    const parado = iniciarFluxo(pedeEmail, "ini", ctx("oi")).sessao;
    const r = continuarFluxo(pedeEmail, parado, ctx("meu email é maria"));
    expect(r.efeitos.some((e) => e.tipo === "campo_contato")).toBe(false);
    expect(textos(r.efeitos)).toEqual(["Esse e-mail não parece certo.", "Qual o seu e-mail?"]);
    expect(r.sessao).toMatchObject({ status: "waiting_input", no_atual: "pergunta" });
  });

  it('sem ligação em "Valor inválido", o fluxo segue pelo caminho normal', () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("grava", "campo_contato", { campo: "aniversario", valor: "ontem" }),
        no("fim", "enviar_mensagem", { texto: "Obrigado!" }),
      ],
      edges: [liga("ini", "grava"), liga("grava", "fim", "proximo")],
    };
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    expect(textos(r.efeitos)).toEqual(["Obrigado!"]);
    expect(r.efeitos.some((e) => e.tipo === "campo_contato")).toBe(false);
  });

  it('valor gravado nunca cai na ligação de "Valor inválido"', () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("grava", "campo_contato", { campo: "nome", valor: "Ana" }),
        no("erro", "enviar_mensagem", { texto: "erro" }),
      ],
      edges: [liga("ini", "grava"), liga("grava", "erro", "invalido")],
    };
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    expect(textos(r.efeitos)).toEqual([]);
    expect(r.efeitos).toContainEqual({ tipo: "campo_contato", campo: "nome", chave: "", valor: "Ana" });
  });

  it("campo personalizado sem chave conta como inválido", () => {
    const g: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("grava", "campo_contato", { campo: "personalizado", valor: "x" })],
      edges: [liga("ini", "grava")],
    };
    expect(iniciarFluxo(g, "ini", ctx("oi")).efeitos).toEqual([]);
  });

  it("valores aceitos e recusados por campo", () => {
    const hoje = new Date("2026-10-22T12:00:00Z");
    expect(valorDoCampo("aniversario", "5/3/1990", hoje)).toBe("1990-03-05");
    expect(valorDoCampo("aniversario", "1990-03-05", hoje)).toBe("1990-03-05");
    expect(valorDoCampo("aniversario", "31/02/1990", hoje)).toBeNull();
    expect(valorDoCampo("aniversario", "01/01/2030", hoje)).toBeNull();
    expect(valorDoCampo("aniversario", "05/03", hoje)).toBeNull();
    expect(valorDoCampo("email", "a@b", hoje)).toBeNull();
    expect(valorDoCampo("nome", "  Ana   Paula ", hoje)).toBe("Ana Paula");
    expect(valorDoCampo("nome", "   ", hoje)).toBeNull();
  });
});

describe("Definir condição", () => {
  const porEtiqueta = (r: Regra): Grafo => ({
    nodes: [
      no("ini", "inicio_canal"),
      no("se", "definir_condicao", { regra: r }),
      no("sim", "enviar_mensagem", { texto: "SIM" }),
      no("nao", "enviar_mensagem", { texto: "NAO" }),
    ],
    edges: [liga("ini", "se"), liga("se", "sim", "sim"), liga("se", "nao", "nao")],
  });

  it("etiqueta: ignora maiúscula e acento, e 'não tem' inverte", () => {
    const vip = contato({ tags: ["cliente vip"] });
    expect(textos(iniciarFluxo(porEtiqueta(regra({ valor: "Cliente VIP" })), "ini", ctx("oi", vip)).efeitos)).toEqual(["SIM"]);
    expect(textos(iniciarFluxo(porEtiqueta(regra({ valor: "Cliente VIP" })), "ini", ctx("oi")).efeitos)).toEqual(["NAO"]);
    expect(
      textos(iniciarFluxo(porEtiqueta(regra({ valor: "cliente vip", operador: "nao_tem" })), "ini", ctx("oi", vip)).efeitos),
    ).toEqual(["NAO"]);
  });

  it("enxerga a etiqueta que o próprio fluxo acabou de pôr", () => {
    const g = porEtiqueta(regra({ valor: "lead" }));
    g.nodes.push(no("tag", "editar_etiquetas", { adicionar: ["Lead"] }));
    g.edges = [liga("ini", "tag"), liga("tag", "se"), ...g.edges.filter((e) => e.source !== "ini")];
    expect(textos(iniciarFluxo(g, "ini", ctx("oi")).efeitos)).toEqual(["SIM"]);
  });

  it("resposta guardada: 'Sim' casa com 'sim' depois de Pedir para digitar", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("p", "pedir_digitar", { pergunta: "Já é cliente?", variavel: "cliente" }),
        no("se", "definir_condicao", {
          regra: regra({ fonte: "variavel", chave: "cliente", operador: "igual", valor: "sim" }),
        }),
        no("s", "enviar_mensagem", { texto: "Bem-vindo de volta" }),
        no("n", "enviar_mensagem", { texto: "Prazer" }),
      ],
      edges: [liga("ini", "p"), liga("p", "se"), liga("se", "s", "sim"), liga("se", "n", "nao")],
    };
    const parado = iniciarFluxo(g, "ini", ctx("oi")).sessao;
    expect(textos(continuarFluxo(g, parado, ctx("SÍM")).efeitos)).toEqual(["Bem-vindo de volta"]);
    expect(textos(continuarFluxo(g, parado, ctx("não")).efeitos)).toEqual(["Prazer"]);
  });

  it("campo do contato: e-mail preenchido, inclusive o que o fluxo gravou no mesmo turno", () => {
    const r = regra({ fonte: "campo_contato", chave: "email", operador: "preenchido" });
    expect(regraVale(r, { mensagem: null, dados: {}, contato: contato() })).toBe(false);
    expect(regraVale(r, { mensagem: null, dados: {}, contato: contato({ email: "a@b.co" }) })).toBe(true);

    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("grava", "campo_contato", { campo: "email", valor: "ana@ex.com" }),
        no("se", "definir_condicao", { regra: r }),
        no("s", "enviar_mensagem", { texto: "tem" }),
      ],
      edges: [liga("ini", "grava"), liga("grava", "se"), liga("se", "s", "sim")],
    };
    expect(textos(iniciarFluxo(g, "ini", ctx("oi")).efeitos)).toEqual(["tem"]);
  });
});

describe("Multi-condicional", () => {
  const g: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("multi", "multi_condicional", {
        regras: [
          regra({ fonte: "mensagem", operador: "contem", valor: "boleto", rotulo: "Financeiro" }),
          regra({ fonte: "mensagem", operador: "contem", valor: "entrega" }),
        ],
      }),
      no("fin", "enviar_mensagem", { texto: "FIN" }),
      no("ent", "enviar_mensagem", { texto: "ENT" }),
      no("outro", "enviar_mensagem", { texto: "OUTRO" }),
    ],
    edges: [
      liga("ini", "multi"),
      liga("multi", "fin", "regra-0"),
      liga("multi", "ent", "regra-1"),
      liga("multi", "outro", "nenhuma"),
    ],
  };

  it("vale a primeira regra que bater; nenhuma vai para 'Nenhuma regra'", () => {
    expect(textos(iniciarFluxo(g, "ini", ctx("2ª via do BOLETO da entrega")).efeitos)).toEqual(["FIN"]);
    expect(textos(iniciarFluxo(g, "ini", ctx("cadê minha entrega?")).efeitos)).toEqual(["ENT"]);
    expect(textos(iniciarFluxo(g, "ini", ctx("oi")).efeitos)).toEqual(["OUTRO"]);
  });

  it("cada regra vira uma saída no quadro, com o rótulo escolhido ou o resumo", () => {
    expect(saidasDoPasso("multi_condicional", g.nodes[1]!.data)).toEqual([
      { id: "regra-0", rotulo: "Financeiro" },
      { id: "regra-1", rotulo: 'Mensagem contém "entrega"' },
      { id: "nenhuma", rotulo: "Nenhuma regra" },
    ]);
  });
});

describe("Criar uma nota", () => {
  it("vira efeito de nota com a resposta do contato preenchida, sem mensagem ao contato", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("p", "pedir_digitar", { pergunta: "Qual o problema?", variavel: "problema" }),
        no("nota", "criar_nota", { texto: "Cliente relatou: {{problema}}" }),
      ],
      edges: [liga("ini", "p"), liga("p", "nota")],
    };
    const parado = iniciarFluxo(g, "ini", ctx("oi")).sessao;
    const r = continuarFluxo(g, parado, ctx("Não liga"));
    expect(r.efeitos).toEqual([{ tipo: "nota", texto: "Cliente relatou: Não liga" }]);
  });
});

describe("validação ao ligar o fluxo", () => {
  it("regra incompleta impede ligar; completa passa", () => {
    expect(problemaDaRegra(regra({}))).toBe("escreva a etiqueta");
    expect(problemaDaRegra(regra({ fonte: "variavel", operador: "igual", valor: "x" }))).toBe(
      "escolha a resposta guardada",
    );
    expect(problemaDaRegra(regra({ fonte: "campo_contato", chave: "email", operador: "vazio" }))).toBeNull();

    const base = (data: Record<string, unknown>): Grafo => ({
      nodes: [no("ini", "inicio_canal"), no("x", "definir_condicao", data)],
      edges: [liga("ini", "x")],
    });
    expect(problemasDoGrafo(base({}))).toContain('no passo "Definir condição", escreva a etiqueta.');
    expect(problemasDoGrafo(base({ regra: regra({ valor: "vip" }) }))).toEqual([]);
  });

  it("nota vazia e campo personalizado sem chave também impedem", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("n", "criar_nota"),
        no("c", "campo_contato", { campo: "personalizado", valor: "{{x}}" }),
      ],
      edges: [liga("ini", "n"), liga("n", "c")],
    };
    const p = problemasDoGrafo(g);
    expect(p).toContain('escreva o texto do passo "Criar uma nota".');
    expect(p).toContain('no passo "Campo do contato", dê um nome ao campo personalizado.');
  });

  it("resumo da regra é curto e legível", () => {
    expect(descreverRegra(regra({ valor: "vip", operador: "nao_tem" }))).toBe('Sem a etiqueta "vip"');
    expect(descreverRegra(regra({ fonte: "variavel", chave: "cpf", operador: "preenchido" }))).toBe(
      "{{cpf}} preenchido",
    );
  });
});
