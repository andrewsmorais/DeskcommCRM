import { describe, expect, it } from "vitest";
import { decidirEmailDePlano } from "@/lib/emails-transacionais/decisao";

describe("decidirEmailDePlano", () => {
  it("primeira vez: contratado", () => {
    expect(decidirEmailDePlano({ plano: "essencial", ultimoPlano: null })).toEqual({
      enviar: true,
      tipo: "contratado",
    });
  });
  it("sobe e desce", () => {
    expect(decidirEmailDePlano({ plano: "impulso", ultimoPlano: "essencial" })).toMatchObject({
      tipo: "melhorado",
      anterior: "essencial",
    });
    expect(decidirEmailDePlano({ plano: "essencial", ultimoPlano: "impulso" })).toMatchObject({
      tipo: "reduzido",
      anterior: "impulso",
    });
  });
  it("mesmo plano não envia", () => {
    expect(decidirEmailDePlano({ plano: "impulso", ultimoPlano: "impulso" })).toMatchObject({
      enviar: false,
      motivo: "mesmo_plano",
    });
  });
  it("entrar no Escala envia escala_ativo; continuar nele não", () => {
    expect(decidirEmailDePlano({ plano: "escala", ultimoPlano: "impulso" })).toEqual({
      enviar: true,
      tipo: "escala_ativo",
    });
    expect(decidirEmailDePlano({ plano: "escala", ultimoPlano: null })).toEqual({
      enviar: true,
      tipo: "escala_ativo",
    });
    expect(decidirEmailDePlano({ plano: "escala", ultimoPlano: "escala" })).toMatchObject({
      enviar: false,
      motivo: "mesmo_plano",
    });
  });
  it("sair do Escala não envia, mas registra", () => {
    expect(decidirEmailDePlano({ plano: "essencial", ultimoPlano: "escala" })).toMatchObject({
      enviar: false,
      motivo: "escala_sem_email",
      registrar: "essencial",
    });
  });
  it("plano desconhecido", () => {
    expect(decidirEmailDePlano({ plano: "xpto", ultimoPlano: null })).toMatchObject({
      enviar: false,
      motivo: "plano_desconhecido",
    });
    expect(decidirEmailDePlano({ plano: null, ultimoPlano: null }).enviar).toBe(false);
  });
});
