import { describe, expect, it } from "vitest";

import { iniciarFluxo, respostasVisiveis, type ContextoDoTurno } from "@/lib/chatbot/motor";
import type { Grafo } from "@/lib/chatbot/passos";
import { corpoPersonalizado } from "@/lib/chatbot/webhook-corpo";
import { interpolateTemplate } from "@/lib/inbox/template-vars";

import {
  comPrefixoDaEmpresa,
  ehSoUmaVariavel,
  lerVariaveisDaEmpresa,
  semVariaveisDaEmpresa,
  variaveisDaEmpresaSchema,
} from "./variaveis";

const lista = [
  { chave: "endereco", valor: "Rua das Flores, 120", descricao: null },
  { chave: "pix", valor: "loja@example.com", descricao: "Chave Pix" },
];

describe("variáveis da empresa — o que se guarda", () => {
  it("aceita nomes simples e recusa acento, espaço e nome repetido", () => {
    expect(variaveisDaEmpresaSchema.safeParse(lista).success).toBe(true);
    expect(variaveisDaEmpresaSchema.safeParse([{ chave: "endereço", valor: "x" }]).success).toBe(false);
    expect(variaveisDaEmpresaSchema.safeParse([{ chave: "meu pix", valor: "x" }]).success).toBe(false);
    const repetida = variaveisDaEmpresaSchema.safeParse([
      { chave: "pix", valor: "a" },
      { chave: "pix", valor: "b" },
    ]);
    expect(repetida.success).toBe(false);
  });

  it("lê o jsonb torto sem derrubar nada: item ruim cai sozinho, lista ruim vira vazia", () => {
    expect(lerVariaveisDaEmpresa(null)).toEqual([]);
    expect(lerVariaveisDaEmpresa({ variaveis: "x" })).toEqual([]);
    const lidas = lerVariaveisDaEmpresa({
      variaveis: [{ chave: "pix", valor: "a" }, { chave: "Ruim!", valor: "b" }, { chave: "pix", valor: "c" }],
    });
    expect(lidas).toEqual([{ chave: "pix", valor: "a", descricao: null }]);
  });

  it("prefixa, separa da sessão e reconhece um link inteiro numa variável", () => {
    const p = comPrefixoDaEmpresa(lista);
    expect(p).toEqual({ "empresa.endereco": "Rua das Flores, 120", "empresa.pix": "loja@example.com" });
    expect(semVariaveisDaEmpresa({ ...p, nome: "Ana" })).toEqual({ nome: "Ana" });
    expect(ehSoUmaVariavel("{{empresa.catalogo}}")).toBe(true);
    expect(ehSoUmaVariavel("{{link}}")).toBe(true);
    expect(ehSoUmaVariavel("{{outra.coisa}}")).toBe(false);
  });
});

describe("variáveis da empresa — onde aparecem", () => {
  const grafo: Grafo = {
    nodes: [
      { id: "ini", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
      {
        id: "msg",
        type: "enviar_mensagem",
        position: { x: 0, y: 0 },
        data: { texto: "{{nome}}, estamos na {{empresa.endereco}}. Pix: {{empresa.pix}}{{empresa.apagada}}" },
      },
    ],
    edges: [{ id: "e1", source: "ini", target: "msg", sourceHandle: "proximo" }],
  };
  const ctx: ContextoDoTurno = {
    mensagem: null,
    agora: new Date("2026-10-22T13:30:00Z"),
    fuso: "America/Sao_Paulo",
    empresa: comPrefixoDaEmpresa(lista),
  };

  it("o chatbot troca {{empresa.x}} e mantém a resposta do contato separada", () => {
    const r = iniciarFluxo(grafo, "ini", ctx, { nome: "Ana" });
    expect(r.efeitos[0]).toEqual({
      tipo: "enviar",
      texto: "Ana, estamos na Rua das Flores, 120. Pix: loja@example.com",
    });
    // O que vai para notas, webhook padrão e outro fluxo: só as respostas.
    expect(respostasVisiveis(r.sessao.dados)).toEqual({ nome: "Ana" });
  });

  it("uma resposta do contato chamada como a variável não toma o lugar dela", () => {
    const r = iniciarFluxo(grafo, "ini", ctx, { nome: "Ana", endereco: "casa do contato" });
    expect(r.efeitos[0]).toMatchObject({ texto: expect.stringContaining("Rua das Flores, 120") });
  });

  it("o corpo personalizado do WebHook escapa o valor como JSON", () => {
    const corpo = corpoPersonalizado('{"onde": "{{empresa.endereco}}"}', { "empresa.endereco": 'Rua "A"' });
    expect(JSON.parse(corpo!)).toEqual({ onde: 'Rua "A"' });
  });

  it("a resposta rápida preenche e deixa à vista a que não existe", () => {
    expect(
      interpolateTemplate("Oi {{primeiro_nome}}! Pix: {{empresa.pix}} {{empresa.sumiu}}", { name: "Ana Silva" }, comPrefixoDaEmpresa(lista)),
    ).toBe("Oi Ana! Pix: loja@example.com {{empresa.sumiu}}");
  });
});
