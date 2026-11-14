/**
 * Chat no site — o "envio" é a própria linha no banco.
 *
 * O balão no site do visitante lê a conversa pela rota pública
 * (`/api/v1/webhooks/webchat/[chave]/ler`). Não há plataforma do outro lado:
 * enviar é confirmar que a mensagem pode ser mostrada e devolver um id nosso.
 *
 * Só texto, por enquanto. Mídia no envio volta erro com uma frase que o
 * atendente entende, em vez de uma linha que nunca aparece no balão.
 */
import { randomUUID } from "node:crypto";

import { CHANNEL_PROVIDER_WEBCHAT } from "../capabilities";
import type { ChannelAdapter } from "../types";

export const webchatAdapter: ChannelAdapter = {
  provider: CHANNEL_PROVIDER_WEBCHAT,
  // Quem endereça é a conversa (pelo id da thread), nunca um telefone.
  resolveRecipient: (input) => (input.isGroup ? null : "visitante-do-site"),
  isConfigured: () => true,
  codes: {
    notConfigured: "webchat_not_configured",
    sendFailed: "webchat_error",
    unknownError: "webchat_unknown",
  },
  async send(envelope) {
    if (envelope.kind !== "text")
      throw new Error("O chat do site só mostra texto por enquanto. Envie a mensagem como texto.");
    if (!envelope.providerConversationId)
      throw new Error("Esta conversa do site não tem visitante ligado. Aguarde ele escrever.");
    if (!(envelope.body ?? "").trim()) throw new Error("Mensagem vazia.");
    await envelope.beforeSend?.();
    return { externalId: `webchat:out:${randomUUID()}` };
  },
};
