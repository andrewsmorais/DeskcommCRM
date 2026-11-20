/**
 * Escolhas (`lib/channels/escolhas.ts`) no formato da Cloud API: até 3 opções
 * viram botões de resposta; de 4 a 10, uma lista. PURO.
 *
 * Limites da plataforma: título de botão até 20 caracteres, título de linha
 * da lista até 24, texto do corpo até 1024, títulos de botão sem repetição.
 * Fora deles devolve null e o envio sai como texto com a lista numerada —
 * nunca corta o título, porque o clique volta com o título e o chatbot
 * reconhece a opção pelo texto.
 */
import type { Escolhas } from "../escolhas";

const LIMITE_DO_BOTAO = 20;
const LIMITE_DA_LINHA = 24;
const LIMITE_DO_CORPO = 1024;

export function payloadDeEscolhas(e: Escolhas | null | undefined): Record<string, unknown> | null {
  if (!e) return null;
  const opcoes = e.opcoes.map((o) => o.trim());
  if (opcoes.length === 0 || opcoes.length > 10 || opcoes.some((o) => !o)) return null;
  if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) return null;
  if (e.pergunta.trim().length > LIMITE_DO_CORPO) return null;
  const corpo = e.pergunta.trim() || "Escolha uma opção:";

  if (opcoes.length <= 3) {
    if (opcoes.some((o) => o.length > LIMITE_DO_BOTAO)) return null;
    return {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: corpo },
        action: {
          buttons: opcoes.map((o, i) => ({
            type: "reply",
            reply: { id: `opcao-${i + 1}`, title: o },
          })),
        },
      },
    };
  }
  if (opcoes.some((o) => o.length > LIMITE_DA_LINHA)) return null;
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: corpo },
      action: {
        button: (e.rotulo_da_lista?.trim() || "Ver opções").slice(0, LIMITE_DO_BOTAO),
        sections: [{ rows: opcoes.map((o, i) => ({ id: `opcao-${i + 1}`, title: o })) }],
      },
    },
  };
}

/**
 * O texto de um clique recebido (botão de resposta, linha de lista, ou botão
 * de resposta rápida de modelo), ou null quando a mensagem não é um clique.
 */
export function textoDoClique(raw: Record<string, unknown>): string | null {
  const tipo = raw.type;
  if (tipo === "interactive") {
    const i = (raw.interactive ?? {}) as Record<string, unknown>;
    const escolha = (i.button_reply ?? i.list_reply) as Record<string, unknown> | undefined;
    return typeof escolha?.title === "string" && escolha.title ? escolha.title : null;
  }
  if (tipo === "button") {
    const b = (raw.button ?? {}) as Record<string, unknown>;
    return typeof b.text === "string" && b.text ? b.text : null;
  }
  return null;
}
