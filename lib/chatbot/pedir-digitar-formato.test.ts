/**
 * "Pedir para digitar" com formato da resposta ("Detecção de valores" da
 * Umbler): CPF/CNPJ com dígito verificador, e-mail, telefone, número e data;
 * pede de novo fora do formato e segue por "Não respondeu certo" depois das
 * tentativas; "Usar a mensagem anterior" só usa a mensagem que ainda é a
 * última da conversa. Fluxo salvo antes dos formatos segue aceitando tudo.
 */
import { describe, expect, it } from "vitest";

import { continuarAposAcao, continuarFluxo, iniciarFluxo, type ContextoDoTurno } from "./motor";
import { lerConfig, saidasDoPasso, type Grafo } from "./passos";
import { comoCnpj, comoCpf, contatoVazio, respostaNoFormato } from "./regras";

describe("formatos", () => {
  it("CPF: com ou sem pontuação, dígitos conferidos, repetido não passa", () => {
    expect(comoCpf("529.982.247-25")).toBe("529.982.247-25");
    expect(comoCpf("52998224725")).toBe("529.982.247-25");
    expect(comoCpf("529.982.247-24")).toBeNull();
    expect(comoCpf("111.111.111-11")).toBeNull();
    expect(comoCpf("meu cpf é 52998224725")).toBeNull();
  });

  it("CNPJ: com ou sem pontuação, dígitos conferidos", () => {
    expect(comoCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(comoCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(comoCnpj("11.222.333/0001-80")).toBeNull();
    expect(comoCnpj("00000000000000")).toBeNull();
  });

  it("e-mail, telefone, número e data voltam arrumados; qualquer aceita tudo", () => {
    expect(respostaNoFormato("email", " Ana@Email.COM ")).toBe("ana@email.com");
    expect(respostaNoFormato("email", "ana@")).toBeNull();
    expect(respostaNoFormato("telefone", "(11) 98765-4321")).toBe("11987654321");
    expect(respostaNoFormato("numero", "abc")).toBeNull();
    expect(respostaNoFormato("data", "25/12/2026")).toBe("25/12/2026");
    expect(respostaNoFormato("qualquer", "")).toBe("");
    expect(respostaNoFormato("cpf", "52998224725")).toBe("529.982.247-25");
  });
});

const ctx = (mensagem: string | null): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

const grafo = (data: Record<string, unknown>, antes: Grafo["nodes"] = []): Grafo => {
  const nodes: Grafo["nodes"] = [
    { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    ...antes,
    {
      id: "p",
      type: "pedir_digitar",
      position: { x: 0, y: 0 },
      data: { pergunta: "Qual o seu CPF?", variavel: "cpf", ...data },
    },
    {
      id: "ok",
      type: "enviar_mensagem",
      position: { x: 0, y: 0 },
      data: { texto: "Recebi {{cpf}}" },
    },
    {
      id: "erro",
      type: "enviar_mensagem",
      position: { x: 0, y: 0 },
      data: { texto: "Vou te passar" },
    },
  ];
  const primeiro = antes[0]?.id ?? "p";
  return {
    nodes,
    edges: [
      { id: "e0", source: "i", target: primeiro, sourceHandle: "proximo" },
      ...(antes.length
        ? [{ id: "e1", source: antes.at(-1)!.id, target: "p", sourceHandle: "proximo" }]
        : []),
      { id: "e2", source: "p", target: "ok", sourceHandle: "proximo" },
      { id: "e3", source: "p", target: "erro", sourceHandle: "invalida" },
    ],
  };
};

describe("Pedir para digitar no motor", () => {
  it("fluxo salvo antes dos formatos: aceita tudo e tem uma saída só", () => {
    const c = lerConfig("pedir_digitar", { pergunta: "?", variavel: "x" });
    expect(c.formato).toBe("qualquer");
    expect(saidasDoPasso("pedir_digitar", {}).map((s) => s.id)).toEqual(["proximo"]);
    expect(saidasDoPasso("pedir_digitar", { formato: "cpf" }).map((s) => s.id)).toEqual([
      "proximo",
      "invalida",
    ]);
  });

  it("fora do formato pede de novo; certo guarda arrumado e segue", () => {
    const g = grafo({ formato: "cpf" });
    const r1 = iniciarFluxo(g, "i", ctx("oi"));
    expect(textos(r1.efeitos)).toEqual(["Qual o seu CPF?"]);
    const r2 = continuarFluxo(g, r1.sessao, ctx("123"));
    expect(textos(r2.efeitos)[0]).toMatch(/CPF não parece certo/);
    expect(r2.sessao.no_atual).toBe("p");
    const r3 = continuarFluxo(g, r2.sessao, ctx("529.982.247-25"));
    expect(textos(r3.efeitos)).toEqual(["Recebi 529.982.247-25"]);
  });

  it("depois das tentativas segue por Não respondeu certo, com a mensagem própria", () => {
    const g = grafo({ formato: "email", tentativas: 2, mensagem_invalida: "E-mail inválido" });
    let r = iniciarFluxo(g, "i", ctx("oi"));
    r = continuarFluxo(g, r.sessao, ctx("nao sei"));
    expect(textos(r.efeitos)).toEqual(["E-mail inválido"]);
    r = continuarFluxo(g, r.sessao, ctx("ainda nao"));
    expect(textos(r.efeitos)).toEqual(["Vou te passar"]);
  });

  it("usar a mensagem anterior: a primeira mensagem já no formato responde sem pergunta", () => {
    const g = grafo({ formato: "cpf", usar_mensagem_anterior: true });
    expect(textos(iniciarFluxo(g, "i", ctx("52998224725")).efeitos)).toEqual([
      "Recebi 529.982.247-25",
    ]);
    // Fora do formato: pergunta normalmente.
    expect(textos(iniciarFluxo(g, "i", ctx("bom dia")).efeitos)).toEqual(["Qual o seu CPF?"]);
  });

  it("usar a mensagem anterior NÃO reaproveita mensagem que já não é a última", () => {
    // O chatbot falou antes: a mensagem do contato não é mais a última.
    const falou = grafo({ formato: "qualquer", usar_mensagem_anterior: true }, [
      { id: "m", type: "enviar_mensagem", position: { x: 0, y: 0 }, data: { texto: "Olá!" } },
    ]);
    expect(textos(iniciarFluxo(falou, "i", ctx("oi")).efeitos)).toEqual([
      "Olá!",
      "Qual o seu CPF?",
    ]);

    // A mensagem já respondeu outro passo (o menu): não vira a resposta deste.
    const menu = grafo({ formato: "qualquer", usar_mensagem_anterior: true }, [
      {
        id: "menu",
        type: "pedir_escolher",
        position: { x: 0, y: 0 },
        data: { pergunta: "Menu", opcoes: ["A"] },
      },
    ]);
    menu.edges = menu.edges.map((e) =>
      e.source === "menu" ? { ...e, sourceHandle: "opcao-0" } : e,
    );
    const r1 = iniciarFluxo(menu, "i", ctx("oi"));
    expect(textos(continuarFluxo(menu, r1.sessao, ctx("1")).efeitos)).toEqual(["Qual o seu CPF?"]);

    // Fluxo acionado por outro fluxo: a mensagem já foi usada lá.
    const solto = grafo({ formato: "qualquer", usar_mensagem_anterior: true });
    expect(textos(iniciarFluxo(solto, "i", ctx("1"), {}, false).efeitos)).toEqual([
      "Qual o seu CPF?",
    ]);
  });

  it("depois de uma ação (modelo enviado) a mensagem não é reaproveitada", () => {
    const g: Grafo = {
      nodes: [
        { id: "t", type: "enviar_template", position: { x: 0, y: 0 }, data: {} },
        {
          id: "p",
          type: "pedir_digitar",
          position: { x: 0, y: 0 },
          data: { pergunta: "Nome?", variavel: "n", usar_mensagem_anterior: true },
        },
      ],
      edges: [{ id: "e", source: "t", target: "p", sourceHandle: "proximo" }],
    };
    const sessao = {
      status: "running" as const,
      no_atual: "t",
      dados: {},
      tentativas: 0,
      retomar_em: null,
    };
    const r = continuarAposAcao(g, sessao as never, true, ctx("oi"));
    expect(textos(r.efeitos)).toEqual(["Nome?"]);
  });
});
