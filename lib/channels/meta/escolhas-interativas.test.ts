/**
 * Botões e lista da API oficial a partir das escolhas neutras, e o clique de
 * volta como o texto da opção — o que o chatbot reconhece. Título que não cabe
 * no limite não é cortado: o envio cai para o texto numerado.
 */
import { describe, expect, it } from "vitest";

import { escolhasDoEnvio } from "../escolhas";
import { payloadDeEscolhas, textoDoClique } from "./escolhas-interativas";
import { parseMetaWebhook } from "./webhook";

describe("escolhas → botões e lista", () => {
  it("até 3 opções curtas viram botões de resposta", () => {
    expect(
      payloadDeEscolhas({ pergunta: "Como posso ajudar?", opcoes: ["Comprar", "Suporte"] }),
    ).toEqual({
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Como posso ajudar?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "opcao-1", title: "Comprar" } },
            { type: "reply", reply: { id: "opcao-2", title: "Suporte" } },
          ],
        },
      },
    });
  });

  it("de 4 a 10 opções viram lista, com o rótulo do botão", () => {
    const p = payloadDeEscolhas({ pergunta: "Escolha", opcoes: ["A", "B", "C", "D"] }) as {
      interactive: { type: string; action: { button: string; sections: { rows: unknown[] }[] } };
    };
    expect(p.interactive.type).toBe("list");
    expect(p.interactive.action.button).toBe("Ver opções");
    expect(p.interactive.action.sections[0]!.rows).toHaveLength(4);
  });

  it("título grande demais, repetido ou pergunta longa: null (vai como texto numerado)", () => {
    expect(payloadDeEscolhas({ pergunta: "?", opcoes: ["Quero falar com uma pessoa"] })).toBeNull();
    expect(payloadDeEscolhas({ pergunta: "?", opcoes: ["Sim", "sim"] })).toBeNull();
    expect(payloadDeEscolhas({ pergunta: "x".repeat(1025), opcoes: ["Sim"] })).toBeNull();
    expect(payloadDeEscolhas(null)).toBeNull();
  });

  it("pergunta vazia ganha um corpo (a plataforma exige)", () => {
    const p = payloadDeEscolhas({ pergunta: "", opcoes: ["Sim", "Não"] }) as {
      interactive: { body: { text: string } };
    };
    expect(p.interactive.body.text).toBe("Escolha uma opção:");
  });

  it("escolhas guardadas no metadata do envio: lidas, ou null se forem lixo", () => {
    expect(escolhasDoEnvio({ escolhas: { pergunta: "P", opcoes: ["A"] } })).toEqual({
      pergunta: "P",
      opcoes: ["A"],
    });
    expect(escolhasDoEnvio({ escolhas: { opcoes: [] } })).toBeNull();
    expect(escolhasDoEnvio(undefined)).toBeNull();
  });
});

describe("o clique de volta", () => {
  it("botão, linha de lista e resposta rápida de modelo viram o texto da opção", () => {
    expect(
      textoDoClique({
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "opcao-1", title: "Comprar" } },
      }),
    ).toBe("Comprar");
    expect(
      textoDoClique({
        type: "interactive",
        interactive: { type: "list_reply", list_reply: { id: "opcao-4", title: "D" } },
      }),
    ).toBe("D");
    expect(textoDoClique({ type: "button", button: { text: "Quero", payload: "x" } })).toBe(
      "Quero",
    );
    expect(textoDoClique({ type: "text", text: { body: "oi" } })).toBeNull();
  });

  it("o webhook entrega o clique como mensagem de texto, sem mídia", () => {
    const [ev] = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.1",
                    from: "5511999999999",
                    timestamp: "1762000000",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: "opcao-2", title: "Suporte" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    } as never);
    expect(ev).toMatchObject({
      kind: "inbound_message",
      type: "text",
      text: "Suporte",
      media: null,
    });
  });
});
