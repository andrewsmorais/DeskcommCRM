import { describe, expect, it } from "vitest";

import {
  fichaDoGoogle,
  linhaDoTelefone,
  nomeDaRede,
  sinaisDaEmpresa,
  tipoDeTelefone,
} from "./sinais-da-empresa";

describe("os sinais da empresa na 1ª mensagem", () => {
  it("a ficha do Google junta a nota e o NÚMERO de avaliações", () => {
    expect(fichaDoGoogle({ rating: 4.9, reviews: 37 })).toBe("nota 4,9 com 37 avaliações");
    expect(fichaDoGoogle({ rating: 5, reviews: 1 })).toBe("nota 5,0 com 1 avaliação");
    expect(fichaDoGoogle({ rating: 4.2, reviews: null })).toBe("nota 4,2");
    expect(fichaDoGoogle({ rating: null, reviews: 12 })).toBe("12 avaliações");
    expect(fichaDoGoogle({})).toBeNull();
  });

  it("a rede vem pelo NOME, para o modelo poder dizer 'vi o Instagram de vocês'", () => {
    expect(nomeDaRede("https://www.instagram.com/padaria")).toBe("Instagram");
    expect(nomeDaRede("https://facebook.com/x")).toBe("Facebook");
    expect(nomeDaRede("https://exemplo.com.br")).toBeNull();
    expect(nomeDaRede("isto não é url")).toBeNull();
  });

  it("celular e fixo pela régua brasileira; outro país não chuta", () => {
    expect(tipoDeTelefone("+5511987654321")).toBe("celular");
    expect(tipoDeTelefone("+551133334444")).toBe("fixo");
    expect(tipoDeTelefone("+351912345678")).toBeNull();
    expect(linhaDoTelefone({ phone: "+551133334444" })).toBe("fixo");
  });

  it("ausência NÃO vira afirmação: sem dado, a linha não existe", () => {
    expect(sinaisDaEmpresa({ rating: null, reviews: null, socials: [], phone: null })).toEqual({});
  });

  it("com tudo, sai uma linha por origem", () => {
    expect(
      sinaisDaEmpresa({
        rating: 4.7,
        reviews: 210,
        socials: ["https://instagram.com/loja"],
        phone: "+5511987654321",
      }),
    ).toEqual({
      "Ficha do Google": "nota 4,7 com 210 avaliações",
      Redes: "Instagram: https://instagram.com/loja",
      Telefone: "celular",
    });
  });
});
