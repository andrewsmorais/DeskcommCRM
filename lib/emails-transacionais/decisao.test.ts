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
  it("o Escala do checkout tem os mesmos e-mails dos outros planos", () => {
    expect(decidirEmailDePlano({ plano: "escala", ultimoPlano: null })).toEqual({
      enviar: true,
      tipo: "contratado",
    });
    expect(decidirEmailDePlano({ plano: "escala", ultimoPlano: "impulso" })).toMatchObject({
      tipo: "melhorado",
      anterior: "impulso",
    });
    expect(decidirEmailDePlano({ plano: "impulso", ultimoPlano: "escala" })).toMatchObject({
      tipo: "reduzido",
      anterior: "escala",
    });
    expect(decidirEmailDePlano({ plano: "escala", ultimoPlano: "escala" })).toMatchObject({
      enviar: false,
      motivo: "mesmo_plano",
    });
  });
  it("Escala com números combinados pelo dono: escala_ativo, uma vez", () => {
    expect(
      decidirEmailDePlano({ plano: "escala", ultimoPlano: "impulso", escalaComProposta: true }),
    ).toEqual({ enviar: true, tipo: "escala_ativo" });
    expect(
      decidirEmailDePlano({ plano: "escala", ultimoPlano: "escala", escalaComProposta: true }),
    ).toMatchObject({ enviar: false, motivo: "mesmo_plano" });
  });
  it("plano desconhecido", () => {
    expect(decidirEmailDePlano({ plano: "xpto", ultimoPlano: null })).toMatchObject({
      enviar: false,
      motivo: "plano_desconhecido",
    });
    expect(decidirEmailDePlano({ plano: null, ultimoPlano: null }).enviar).toBe(false);
  });
});
