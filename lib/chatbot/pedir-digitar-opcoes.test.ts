/**
 * "Pedir para digitar" com VÁRIAS RESPOSTAS ACEITAS (paridade com a Umbler):
 * cada opção tem formato pronto ou regra própria e uma saída sua; a resposta
 * segue pela PRIMEIRA que bate; nenhuma → pede de novo e depois "Nenhuma
 * opção". E a regra própria é recusada quando pode travar o worker (ReDoS).
 */
import { describe, expect, it } from "vitest";

import { continuarFluxo, iniciarFluxo, type ContextoDoTurno } from "./motor";
import { saidasDoPasso, type Grafo } from "./passos";
import { casaRegex, problemaDaRegex } from "./regex-segura";
import { contatoVazio, primeiraOpcaoQueBate } from "./regras";
import { problemasDoGrafo } from "./validar";

const ctx = (mensagem: string | null): ContextoDoTurno => ({
  mensagem,
  agora: new Date("2026-11-03T13:00:00Z"),
  fuso: "America/Sao_Paulo",
  contato: contatoVazio(),
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

const OPCOES = [
  { nome: "CPF", formato: "cpf", regex: "" },
  { nome: "Placa", formato: "regex", regex: "^[A-Z]{3}-?\\d[A-Z0-9]\\d{2}$" },
  { nome: "E-mail", formato: "email", regex: "" },
];

function grafo(extra: Record<string, unknown> = {}): Grafo {
  const msg = (id: string, texto: string) => ({ id, type: "enviar_mensagem", position: { x: 0, y: 0 }, data: { texto } });
  return {
    nodes: [
      { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
      {
        id: "p",
        type: "pedir_digitar",
        position: { x: 0, y: 0 },
        data: { pergunta: "Mande seu CPF, placa ou e-mail", variavel: "doc", opcoes: OPCOES, ...extra },
      },
      msg("cpf", "CPF {{doc}}"),
      msg("placa", "Placa {{doc}}"),
      msg("email", "E-mail {{doc}}"),
      msg("nada", "Vou te passar"),
    ],
    edges: [
      { id: "e0", source: "i", target: "p", sourceHandle: "proximo" },
      { id: "e1", source: "p", target: "cpf", sourceHandle: "opcao-0" },
      { id: "e2", source: "p", target: "placa", sourceHandle: "opcao-1" },
      { id: "e3", source: "p", target: "email", sourceHandle: "opcao-2" },
      { id: "e4", source: "p", target: "nada", sourceHandle: "invalida" },
    ],
  };
}

describe("várias respostas aceitas no motor", () => {
  it("uma saída por opção, mais Nenhuma opção", () => {
    expect(saidasDoPasso("pedir_digitar", { opcoes: OPCOES }).map((s) => s.id)).toEqual([
      "opcao-0",
      "opcao-1",
      "opcao-2",
      "invalida",
    ]);
  });

  it("cada resposta segue pela sua opção, com o valor arrumado", () => {
    const g = grafo();
    const comecar = () => iniciarFluxo(g, "i", ctx("oi")).sessao;
    expect(textos(continuarFluxo(g, comecar(), ctx("52998224725")).efeitos)).toEqual(["CPF 529.982.247-25"]);
    expect(textos(continuarFluxo(g, comecar(), ctx("abc1d23")).efeitos)).toEqual(["Placa abc1d23"]);
    expect(textos(continuarFluxo(g, comecar(), ctx("Ana@Email.com")).efeitos)).toEqual(["E-mail ana@email.com"]);
  });

  it("a PRIMEIRA que bate decide, na ordem da lista", () => {
    const qualquerPrimeiro = [{ nome: "Tudo", formato: "qualquer" as const, regex: "" }, ...OPCOES.slice(0, 1)] as never;
    expect(primeiraOpcaoQueBate(qualquerPrimeiro, "52998224725")?.indice).toBe(0);
  });

  it("nenhuma bate: pede de novo, e depois das tentativas segue por Nenhuma opção", () => {
    const g = grafo({ tentativas: 2 });
    let r = iniciarFluxo(g, "i", ctx("oi"));
    r = continuarFluxo(g, r.sessao, ctx("não sei"));
    expect(textos(r.efeitos)[0]).toMatch(/Não entendi a sua resposta/);
    r = continuarFluxo(g, r.sessao, ctx("também não"));
    expect(textos(r.efeitos)).toEqual(["Vou te passar"]);
  });

  it("usar a mensagem anterior também vale com opções", () => {
    const g = grafo({ usar_mensagem_anterior: true });
    expect(textos(iniciarFluxo(g, "i", ctx("52998224725")).efeitos)).toEqual(["CPF 529.982.247-25"]);
  });
});

describe("regra própria segura", () => {
  it("regras comuns passam e casam", () => {
    for (const r of ["^\\d{5}-?\\d{3}$", "^[A-Z]{3}-?\\d{4}$", "pedido\\s*#?\\d+", "^(sim|não|nao)$", "^(?:\\d{2}\\.){2}\\d{2}$"])
      expect(problemaDaRegex(r), r).toBeNull();
    expect(casaRegex("^\\d{5}-?\\d{3}$", " 01310-100 ")).toBe(true);
    expect(casaRegex("^(sim|não)$", "SIM")).toBe(true);
  });

  it("regras que podem travar o atendimento são recusadas", () => {
    for (const r of ["(a+)+$", "(a|aa)+b", "(.*a){12}", "(\\w+\\s?)*$", "(a)\\1", "(?<=x)y", "a*b*c*d*e*", "(x"])
      expect(problemaDaRegex(r), r).not.toBeNull();
    expect(problemaDaRegex("x".repeat(201))).not.toBeNull();
  });

  it("regra recusada nunca casa (fluxo antigo ou importado) — e não trava", () => {
    const antes = Date.now();
    expect(casaRegex("(a+)+$", `${"a".repeat(40)}!`)).toBe(false);
    expect(Date.now() - antes).toBeLessThan(100);
  });

  it("cadeia de opcionais e de faixas largas é recusada (auditoria de 14/11)", () => {
    for (const r of [`${"a?".repeat(40)}!`, `${"a?".repeat(9)}!`, `\\w*\\w*\\w*${"a?".repeat(3)}!`, `${"a{0,99}".repeat(25)}!`, `${"a{0,99}".repeat(4)}!`, "a{1,3}b{2,9}c{0,5}d{1,4}"])
      expect(problemaDaRegex(r), r).not.toBeNull();
    // O que é comum continua passando: poucos opcionais, faixas exatas.
    for (const r of ["^\\+?55?\\s?\\(?\\d{2}\\)?\\s?\\d{4,5}-?\\d{4}$", "^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$", "^[A-Z]{3}\\d{1,2}[A-Z]?\\d{2}$"])
      expect(problemaDaRegex(r), r).toBeNull();
  });

  it("a pior regra aceita com opcionais, na maior mensagem, roda rápido", () => {
    const pior = `\\w*\\w*\\w{0,99}${"a?".repeat(2)}!`;
    expect(problemaDaRegex(pior)).toBeNull();
    const antes = Date.now();
    casaRegex(pior, "a".repeat(1000));
    expect(Date.now() - antes).toBeLessThan(1500);
  });

  it("a pior regra aceita, na maior mensagem, roda rápido", () => {
    const pior = "\\w*\\w*\\w*!";
    expect(problemaDaRegex(pior)).toBeNull();
    const antes = Date.now();
    casaRegex(pior, "a".repeat(1000));
    expect(Date.now() - antes).toBeLessThan(500);
  });

  it("validar o fluxo aponta a regra perigosa pelo nome da opção", () => {
    const g = grafo({ opcoes: [{ nome: "Ruim", formato: "regex", regex: "(a+)+" }] });
    expect(problemasDoGrafo(g).join(" ")).toMatch(/Ruim/);
  });
});
