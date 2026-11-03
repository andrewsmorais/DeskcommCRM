/**
 * Os blocos da Umbler que entraram em 03/11/2026, no motor PURO:
 * "Valor", "Enviar formulário", "Transferir p/ agentes de IA",
 * "Enviar template" e "Fluxo de espera". O que toca banco e WhatsApp
 * (entregar ao agente, mandar o modelo, desarmar o relógio) é do executor.
 */
import { describe, expect, it } from "vitest";

import {
  CHAVE_DO_FORMULARIO,
  continuarAposAcao,
  continuarFluxo,
  iniciarFluxo,
  relogioDaEspera,
  type ContextoDoTurno,
} from "./motor";
import { saidasDoPasso, type Grafo } from "./passos";
import { comoData, respostaDoFormulario, valorVale } from "./regras";
import { contatoVazio } from "./regras";
import { problemasDoGrafo } from "./validar";

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
const ctx = (mensagem: string | null): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

describe("Valor", () => {
  const base = { mensagem: null, contato: contatoVazio() };
  const cfg = (p: Record<string, unknown>) => ({
    fonte: "variavel" as const,
    chave: "total",
    operador: "igual" as const,
    valor: "",
    ...p,
  });

  it("compara número com número (4,5 é maior que 4)", () => {
    expect(
      valorVale(cfg({ operador: "maior" }), { ...base, dados: { total: "4,5" }, alvo: "4" }),
    ).toBe(true);
    expect(
      valorVale(cfg({ operador: "menor_ou_igual" }), {
        ...base,
        dados: { total: "10" },
        alvo: "9",
      }),
    ).toBe(false);
  });

  it("compara data com data, em dd/mm/aaaa ou aaaa-mm-dd", () => {
    expect(
      valorVale(cfg({ operador: "maior" }), {
        ...base,
        dados: { total: "25/12/2026" },
        alvo: "2026-11-03",
      }),
    ).toBe(true);
  });

  it("maior/menor entre texto e número é falso, nunca palpite", () => {
    expect(
      valorVale(cfg({ operador: "maior" }), { ...base, dados: { total: "abc" }, alvo: "5" }),
    ).toBe(false);
  });

  it("texto ignora maiúsculas e acentos; começa/termina com", () => {
    const dados = { total: "São Paulo" };
    expect(valorVale(cfg({ operador: "igual" }), { ...base, dados, alvo: "sao paulo" })).toBe(true);
    expect(valorVale(cfg({ operador: "comeca_com" }), { ...base, dados, alvo: "SAO" })).toBe(true);
    expect(valorVale(cfg({ operador: "termina_com" }), { ...base, dados, alvo: "rio" })).toBe(
      false,
    );
    expect(valorVale(cfg({ operador: "nao_contem" }), { ...base, dados, alvo: "rio" })).toBe(true);
  });

  it("no fluxo, o valor do passo aceita {{variavel}} e segue por Verdadeiro/Falso", () => {
    const grafo: Grafo = {
      nodes: [
        no("ini", "inicio_automacao"),
        no("v", "valor", { chave: "digitado", operador: "igual", valor: "{{cadastro}}" }),
        no("ok", "enviar_mensagem", { texto: "confere" }),
        no("x", "enviar_mensagem", { texto: "não confere" }),
      ],
      edges: [liga("ini", "v"), liga("v", "ok", "sim"), liga("v", "x", "nao")],
    };
    const iguais = iniciarFluxo(grafo, "ini", ctx(null), {
      digitado: "A@B.com",
      cadastro: "a@b.com",
    });
    expect(textos(iguais.efeitos)).toEqual(["confere"]);
    const diferentes = iniciarFluxo(grafo, "ini", ctx(null), {
      digitado: "x@b.com",
      cadastro: "a@b.com",
    });
    expect(textos(diferentes.efeitos)).toEqual(["não confere"]);
  });
});

describe("Enviar formulário", () => {
  const grafo: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("f", "enviar_formulario", {
        introducao: "Preciso de dois dados.",
        perguntas: [
          { pergunta: "Seu nome?", variavel: "nome", tipo: "texto", gravar_em: "nome" },
          { pergunta: "Seu e-mail?", variavel: "email", tipo: "email", gravar_em: "email" },
        ],
        tentativas: 2,
        conclusao: "Obrigado, {{nome}}!",
      }),
      no("depois", "enviar_mensagem", { texto: "seguiu" }),
      no("erro", "enviar_mensagem", { texto: "desistiu" }),
    ],
    edges: [liga("ini", "f"), liga("f", "depois"), liga("f", "erro", "invalida")],
  };

  it("abre com a introdução e a primeira pergunta, e espera", () => {
    const r = iniciarFluxo(grafo, "ini", ctx("oi"));
    expect(textos(r.efeitos)).toEqual(["Preciso de dois dados.\n\nSeu nome?"]);
    expect(r.sessao.status).toBe("waiting_input");
    expect(r.sessao.dados[CHAVE_DO_FORMULARIO]).toBe("0");
  });

  it("uma pergunta por mensagem, grava no contato e fecha com a conclusão", () => {
    const r1 = iniciarFluxo(grafo, "ini", ctx("oi"));
    const r2 = continuarFluxo(grafo, r1.sessao, ctx("  Ana   Lima "));
    expect(textos(r2.efeitos)).toEqual(["Seu e-mail?"]);
    expect(r2.efeitos).toContainEqual({
      tipo: "campo_contato",
      campo: "nome",
      chave: "",
      valor: "Ana Lima",
    });
    const r3 = continuarFluxo(grafo, r2.sessao, ctx("ANA@Exemplo.com"));
    expect(r3.efeitos).toContainEqual({
      tipo: "campo_contato",
      campo: "email",
      chave: "",
      valor: "ana@exemplo.com",
    });
    expect(textos(r3.efeitos)).toEqual(["Obrigado, Ana Lima!", "seguiu"]);
    expect(r3.sessao.dados).toMatchObject({ nome: "Ana Lima", email: "ana@exemplo.com" });
    expect(r3.sessao.dados[CHAVE_DO_FORMULARIO]).toBeUndefined();
  });

  it("resposta que não serve pede de novo; esgotou as tentativas, segue por Não respondeu certo", () => {
    const r1 = iniciarFluxo(grafo, "ini", ctx("oi"));
    const r2 = continuarFluxo(grafo, r1.sessao, ctx("Ana"));
    const r3 = continuarFluxo(grafo, r2.sessao, ctx("não tenho"));
    expect(r3.sessao.status).toBe("waiting_input");
    expect(textos(r3.efeitos)[0]).toContain("Seu e-mail?");
    const r4 = continuarFluxo(grafo, r3.sessao, ctx("ainda não"));
    expect(textos(r4.efeitos)).toEqual(["desistiu"]);
    expect(r4.sessao.dados[CHAVE_DO_FORMULARIO]).toBeUndefined();
  });

  it("cada tipo confere a resposta", () => {
    const sem = { gravar_em: "" as const };
    expect(respostaDoFormulario({ ...sem, tipo: "numero" }, "4,5")?.valor).toBe("4,5");
    expect(respostaDoFormulario({ ...sem, tipo: "numero" }, "quatro")).toBeNull();
    expect(respostaDoFormulario({ ...sem, tipo: "data" }, "3/11/2026")?.valor).toBe("03/11/2026");
    expect(respostaDoFormulario({ ...sem, tipo: "data" }, "31/02/2026")).toBeNull();
    expect(respostaDoFormulario({ ...sem, tipo: "telefone" }, "(11) 98888-7777")?.valor).toBe(
      "11988887777",
    );
    expect(respostaDoFormulario({ ...sem, tipo: "telefone" }, "123")).toBeNull();
    // Aniversário no futuro não serve para o cadastro, então não serve como resposta.
    expect(
      respostaDoFormulario(
        { tipo: "data", gravar_em: "aniversario" },
        "01/01/2099",
        new Date("2026-11-03"),
      ),
    ).toBeNull();
    expect(comoData("2026-11-03")).not.toBeNull();
  });
});

describe("Transferir p/ agentes de IA", () => {
  const grafo: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("ia", "transferir_ia", { mensagem: "Vou te passar para o assistente." }),
      no("equipe", "transferir_equipe"),
    ],
    edges: [liga("ini", "ia"), liga("ia", "equipe", "falha")],
  };

  it("para pedindo ao executor que entregue — a mensagem ainda não sai", () => {
    const r = iniciarFluxo(grafo, "ini", ctx("oi"));
    expect(r.pendente).toEqual({ tipo: "ia", no: "ia" });
    expect(textos(r.efeitos)).toEqual([]);
  });

  it("entregou: manda a mensagem e o chatbot sai da conversa", () => {
    const r = iniciarFluxo(grafo, "ini", ctx("oi"));
    const depois = continuarAposAcao(grafo, r.sessao, true, ctx("oi"));
    expect(textos(depois.efeitos)).toEqual(["Vou te passar para o assistente."]);
    expect(depois.sessao.status).toBe("transferred");
  });

  it("sem agente no número: segue por Sem agente de IA, sem a mensagem", () => {
    const r = iniciarFluxo(grafo, "ini", ctx("oi"));
    const depois = continuarAposAcao(grafo, r.sessao, false, ctx("oi"));
    expect(textos(depois.efeitos)).toEqual([]);
    expect(depois.efeitos).toContainEqual({ tipo: "transferir_equipe" });
  });
});

describe("Enviar template", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const grafo = (template_id: string | null): Grafo => ({
    nodes: [
      no("ini", "inicio_automacao"),
      no("t", "enviar_template", { template_id }),
      no("ok", "enviar_mensagem", { texto: "saiu" }),
      no("x", "enviar_mensagem", { texto: "não saiu" }),
    ],
    edges: [liga("ini", "t"), liga("t", "ok"), liga("t", "x", "falha")],
  });

  it("com modelo escolhido, pede ao executor; o resultado escolhe a saída", () => {
    const g = grafo(ID);
    const r = iniciarFluxo(g, "ini", ctx(null));
    expect(r.pendente).toEqual({ tipo: "template", no: "t", template_id: ID });
    expect(textos(continuarAposAcao(g, r.sessao, true, ctx(null)).efeitos)).toEqual(["saiu"]);
    expect(textos(continuarAposAcao(g, r.sessao, false, ctx(null)).efeitos)).toEqual(["não saiu"]);
  });

  it("sem modelo escolhido, segue direto por Não enviado", () => {
    const r = iniciarFluxo(grafo(null), "ini", ctx(null));
    expect(r.pendente).toBeUndefined();
    expect(textos(r.efeitos)).toEqual(["não saiu"]);
  });

  it("Não enviado sem ligação encerra o fluxo (não finge que saiu)", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_automacao"),
        no("t", "enviar_template", { template_id: ID }),
        no("ok", "enviar_mensagem", { texto: "saiu" }),
      ],
      edges: [liga("ini", "t"), liga("t", "ok")],
    };
    const r = iniciarFluxo(g, "ini", ctx(null));
    const depois = continuarAposAcao(g, r.sessao, false, ctx(null));
    expect(textos(depois.efeitos)).toEqual([]);
    expect(depois.sessao.status).toBe("completed");
  });
});

describe("Fluxo de espera", () => {
  it("vira efeito de ligar/desligar e o fluxo segue", () => {
    const grafo: Grafo = {
      nodes: [
        no("ini", "inicio_manual"),
        no("e", "fluxo_de_espera", { acao: "desligar" }),
        no("m", "enviar_mensagem", { texto: "ok" }),
      ],
      edges: [liga("ini", "e"), liga("e", "m")],
    };
    const r = iniciarFluxo(grafo, "ini", ctx(null));
    expect(r.efeitos).toEqual([
      { tipo: "fluxo_de_espera", ligar: false },
      { tipo: "enviar", texto: "ok" },
    ]);
  });

  it("religar só arma relógio se a transferência tem espera e ainda faltam vezes", () => {
    const grafo: Grafo = {
      nodes: [
        no("t", "transferir_equipe", {
          espera_minutos: 10,
          espera_mensagem: "Já já",
          espera_vezes: 2,
        }),
        no("s", "transferir_equipe"),
      ],
      edges: [],
    };
    const agora = new Date("2026-11-03T13:00:00Z");
    expect(relogioDaEspera(grafo, "t", 1, agora)).toBe("2026-11-03T13:10:00.000Z");
    expect(relogioDaEspera(grafo, "t", 2, agora)).toBeNull();
    expect(relogioDaEspera(grafo, "s", 0, agora)).toBeNull();
  });
});

describe("tela e validação", () => {
  it("as saídas dos passos novos", () => {
    expect(saidasDoPasso("valor", {}).map((s) => s.id)).toEqual(["sim", "nao"]);
    expect(saidasDoPasso("transferir_ia", {}).map((s) => s.id)).toEqual(["falha"]);
    expect(saidasDoPasso("enviar_template", {}).map((s) => s.id)).toEqual(["proximo", "falha"]);
    expect(saidasDoPasso("enviar_formulario", {}).map((s) => s.id)).toEqual([
      "proximo",
      "invalida",
    ]);
    expect(saidasDoPasso("fluxo_de_espera", {}).map((s) => s.id)).toEqual(["proximo"]);
  });

  it("não liga fluxo com passo novo incompleto", () => {
    const grafo: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("v", "valor", { chave: "" }),
        no("t", "enviar_template"),
        no("f", "enviar_formulario", {
          perguntas: [
            { pergunta: "", variavel: "a" },
            { pergunta: "B?", variavel: "a" },
          ],
        }),
      ],
      edges: [liga("ini", "v")],
    };
    const p = problemasDoGrafo(grafo).join(" | ");
    expect(p).toContain("escolha a resposta guardada");
    expect(p).toContain('escolha o modelo do passo "Enviar template"');
    expect(p).toContain("escreva a pergunta 1");
    expect(p).toContain("nome diferente");
  });
});

describe("Privar ou liberar", () => {
  it("vira efeito de privacidade e o fluxo segue", () => {
    const grafo: Grafo = {
      nodes: [
        no("ini", "inicio_manual"),
        no("p", "privar_liberar", { acao: "privar" }),
        no("l", "privar_liberar", { acao: "liberar" }),
      ],
      edges: [liga("ini", "p"), liga("p", "l")],
    };
    expect(iniciarFluxo(grafo, "ini", ctx(null)).efeitos).toEqual([
      { tipo: "privacidade", privada: true },
      { tipo: "privacidade", privada: false },
    ]);
  });
});
