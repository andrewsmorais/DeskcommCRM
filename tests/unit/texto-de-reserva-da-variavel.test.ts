import { describe, expect, it } from "vitest";

import { renderTemplate } from "@/lib/automation/template";
import { renderizar, variaveisUsadas } from "@/lib/campanhas/renderizador";
import { interpolateTemplate } from "@/lib/inbox/template-vars";

const TARDE = new Date("2026-11-18T18:00:00Z");
const FUSO = "America/Sao_Paulo";

describe('automação: texto de reserva {{variavel|"reserva"}}', () => {
  const semNome = { contact: { name: null }, lead: { custom_fields: { cupom: "" } } };
  const comNome = { contact: { name: "Ana Souza" } };

  it("sem o dado, sai a reserva", () => {
    expect(renderTemplate('Oi {{primeiro_nome|"aluno"}}!', semNome)).toBe("Oi aluno!");
    expect(renderTemplate('Oi {{nome|"aluno"}}!', semNome)).toBe("Oi aluno!");
    expect(renderTemplate('{{lead.ghost|"nada"}}', semNome)).toBe("nada");
  });

  it("com o dado, a reserva é ignorada", () => {
    expect(renderTemplate('Oi {{primeiro_nome|"aluno"}}!', comNome)).toBe("Oi Ana!");
  });

  it("aceita aspas tipográficas e espaços", () => {
    expect(renderTemplate("Oi {{ nome | “aluno” }}", semNome)).toBe("Oi aluno");
  });

  it("reserva torta não casa e fica como escrita", () => {
    expect(renderTemplate('{{nome|"a{b"}}', semNome)).toBe('{{nome|"a{b"}}');
    expect(renderTemplate("{{nome|aluno}}", semNome)).toBe("{{nome|aluno}}");
  });

  it("o nome da agenda continua só da equipe, mesmo com reserva", () => {
    expect(
      renderTemplate('{{contact.address_book_name|"x"}}', { contact: { address_book_name: "Fulano Interno" } }),
    ).toBe("");
  });
});

describe("campanha: texto de reserva", () => {
  it("sem o dado, sai a reserva e não conta como falta", () => {
    const r = renderizar('Olá {{primeiro_nome|"aluno"}}, tudo bem?', { nome: null });
    expect(r.texto).toBe("Olá aluno, tudo bem?");
    expect(r.faltando).toEqual([]);
  });

  it("com o dado, a reserva é ignorada", () => {
    expect(renderizar('Olá {{primeiro_nome|"aluno"}}', { nome: "Ana Souza" }).texto).toBe("Olá Ana");
  });

  it("sem reserva a falta é a de antes", () => {
    const r = renderizar("Olá {{primeiro_nome}}", { nome: null });
    expect(r.texto).toBe("Olá {{primeiro_nome}}");
    expect(r.faltando).toEqual(["primeiro_nome"]);
  });

  it("a saudação aceita reserva mas nunca a usa", () => {
    expect(renderizar('{{saudacao|"Olá"}}', { nome: null }).texto).toBe('{{saudacao|"Olá"}}');
    expect(renderizar('{{saudacao|"Olá"}}', { nome: null }, { agora: TARDE, fuso: FUSO }).texto).toBe("Boa tarde");
  });

  it("a reserva sai literal ($& e $1 incluídos)", () => {
    const r = renderizar('{{primeiro_nome|"aluno $& $1"}}', { nome: null });
    expect(r.texto).toBe("aluno $& $1");
  });

  it("reserva torta não casa", () => {
    for (const e of ['{{nome|"a{b"}}', "{{nome|aluno}}", '{{nome|""}}', `{{nome|"${"x".repeat(101)}"}}`]) {
      expect(renderizar(e, { nome: null }).texto, e).toBe(e);
    }
  });

  it("variável desconhecida com reserva fica literal", () => {
    const r = renderizar('Oi {{sobrenome|"x"}}', { nome: "Ana" });
    expect(r.texto).toBe('Oi {{sobrenome|"x"}}');
    expect(r.desconhecidas).toEqual(["sobrenome"]);
  });

  it("variaveisUsadas enxerga a variável com reserva", () => {
    expect(variaveisUsadas('{{primeiro_nome|"aluno"}}')).toEqual(["primeiro_nome"]);
  });
});

describe("Inbox: texto de reserva", () => {
  it("sem nome, sai a reserva; com nome, é ignorada", () => {
    expect(interpolateTemplate('Oi {{primeiro_nome|"aluno"}}', { name: null })).toBe("Oi aluno");
    expect(interpolateTemplate('Oi {{nome|"aluno"}}', { name: null })).toBe("Oi aluno");
    expect(interpolateTemplate('Oi {{primeiro_nome|"aluno"}}', { name: "Ana Paula" })).toBe("Oi Ana");
  });

  it("variável da empresa vazia também usa a reserva", () => {
    expect(interpolateTemplate('Fale em {{empresa.fone|"nosso site"}}', { name: "X" }, {})).toBe("Fale em nosso site");
  });

  it("variável desconhecida com reserva fica literal", () => {
    expect(interpolateTemplate('Cupom {{codigo|"x"}}', { name: "X" })).toBe('Cupom {{codigo|"x"}}');
  });
});
