import { describe, expect, it } from "vitest";

import {
  assinarTexto,
  despedidaSugerida,
  deveAssinar,
  lerPreferenciasDeConversa,
  nomeQueAssina,
  PREFERENCIAS_PADRAO,
  saidasDoFinalizar,
  textoAssinado,
} from "./preferencias";

describe("preferências de conversa da empresa", () => {
  it("sem nada gravado, vale o padrão: o atendente escolhe as duas coisas", () => {
    expect(lerPreferenciasDeConversa({})).toEqual(PREFERENCIAS_PADRAO);
    expect(PREFERENCIAS_PADRAO.assinatura).toBe("atendente_escolhe");
    expect(PREFERENCIAS_PADRAO.finalizar.comportamento).toBe("atendente_escolhe");
  });

  it("valor torto no banco não derruba: vira o padrão", () => {
    expect(lerPreferenciasDeConversa({ conversas: { assinatura: "talvez" } })).toEqual(PREFERENCIAS_PADRAO);
    expect(lerPreferenciasDeConversa(null)).toEqual(PREFERENCIAS_PADRAO);
  });

  it("mensagem padrão vazia é 'sem sugestão'", () => {
    const p = lerPreferenciasDeConversa({ conversas: { finalizar: { mensagem_padrao: "   " } } });
    expect(p.finalizar.mensagem_padrao).toBeNull();
  });
});

describe("assinatura", () => {
  it("a empresa manda: sempre assina, nunca assina; senão, vale a chave", () => {
    expect(deveAssinar("sempre", false)).toBe(true);
    expect(deveAssinar("nunca", true)).toBe(false);
    expect(deveAssinar("atendente_escolhe", true)).toBe(true);
    expect(deveAssinar("atendente_escolhe", undefined)).toBe(false);
  });

  it("o nome: a assinatura do perfil, senão o nome; sem os dois, ninguém assina", () => {
    expect(nomeQueAssina({ assinatura: "Ana · Vendas", full_name: "Ana Lima" })).toBe("Ana · Vendas");
    expect(nomeQueAssina({ assinatura: "  ", full_name: "Ana Lima" })).toBe("Ana Lima");
    expect(nomeQueAssina({})).toBeNull();
  });

  it("tira o que quebraria o negrito do WhatsApp e corta em 75 letras", () => {
    expect(nomeQueAssina({ assinatura: "*Ana*\nLima" })).toBe("Ana Lima");
    expect(nomeQueAssina({ assinatura: "x".repeat(90) })?.length).toBe(75);
  });

  it("formato: nome em negrito numa linha, mensagem embaixo", () => {
    expect(assinarTexto("Ana", "Oi!")).toBe("*Ana:*\nOi!");
  });

  it("assinar não pode cortar o texto: passa do limite → recusa", () => {
    expect(textoAssinado("Ana", "x".repeat(4096))).toBeNull();
    expect(textoAssinado(null, "Oi")).toBe("Oi");
  });
});

describe("Fechar", () => {
  it("o que a janela oferece em cada comportamento", () => {
    expect(saidasDoFinalizar("atendente_escolhe")).toEqual(["nenhum", "mensagem", "chatbot"]);
    expect(saidasDoFinalizar("so_finalizar")).toEqual(["nenhum"]);
    expect(saidasDoFinalizar("mensagem")).toEqual(["mensagem"]);
    expect(saidasDoFinalizar("chatbot")).toEqual(["chatbot"]);
  });

  it("a despedida do perfil vale mais que a da empresa", () => {
    expect(despedidaSugerida("Valeu, abraço da Ana!", "Obrigado.")).toBe("Valeu, abraço da Ana!");
    expect(despedidaSugerida("", "Obrigado.")).toBe("Obrigado.");
    expect(despedidaSugerida(null, null)).toBe("");
  });
});
