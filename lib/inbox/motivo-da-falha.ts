/**
 * O MOTIVO de uma mensagem que ficou `failed`, na frase que a pessoa lê —
 * embaixo da bolha, à vista (o dedo não abre Tooltip). Vindo do produto
 * original, numa versão menor: esta instalação não tem o canal oficial com
 * modelos, então a recusa de modelo da plataforma não entra aqui.
 *
 * A ordem: (1) a frase nossa do código; (2) a frase do canal
 * (`fraseDaFalhaDeCanal`); (3) o texto gravado, só se não tiver sinal de texto
 * CRU do transporte (URL, IP, host:porta, erro de rede, linha de stack) — é
 * esse texto que traz o endereço interno do serviço; (4) a frase genérica.
 */
import { fraseDaFalhaDeCanal } from "@/lib/channels/frases-de-falha";
import type { Message } from "@/lib/types/messaging";

const FRASES_DA_CONVERSA: Record<string, string> = {
  pre_go_live: "Envio automático bloqueado pelo modo de teste do canal.",
  org_suspensa: "Envio automático bloqueado: a organização está suspensa.",
  channel_archived: "Este número foi excluído da Central de Conexões.",
};

const SINAL_DE_TEXTO_CRU =
  /https?:\/\/|[Ff]etch failed|\bE[A-Z_]{4,}\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[A-Za-z][\w.-]*:\d{2,5}\b|^[a-z0-9]+_[a-z0-9_]+|\n\s+at\s/;

export function motivoDaFalhaDaMensagem(
  mensagem: Pick<Message, "error_message" | "error_code">,
  t: (texto: string) => string,
): string {
  const codigo = mensagem.error_code ?? "";
  if (Object.hasOwn(FRASES_DA_CONVERSA, codigo)) return t(FRASES_DA_CONVERSA[codigo] as string);
  const doCanal = fraseDaFalhaDeCanal(codigo);
  if (doCanal) return t(doCanal);
  const gravado = mensagem.error_message?.trim() ?? "";
  if (gravado && !SINAL_DE_TEXTO_CRU.test(gravado)) return t(gravado.slice(0, 300));
  return t("Não foi possível enviar esta mensagem.");
}
