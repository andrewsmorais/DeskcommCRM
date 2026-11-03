/**
 * Escolhas clicáveis (botões / lista) no vocabulário NEUTRO do canal.
 *
 * Quem pede escolhas (o "Pedir para escolher" do chatbot) manda SEMPRE o texto
 * com as opções numeradas no `body` e, ao lado, as escolhas em
 * `metadata.escolhas`. O adapter do canal decide como mostrar: o que sabe
 * desenhar botão desenha; o que não sabe ignora e o contato lê a lista
 * numerada — que é o que acontece em número conectado por QR Code, onde o
 * próprio WhatsApp não exibe botão. Quem pede não pergunta QUAL canal é
 * (`docs/doctrine/restricao-de-canal.md`).
 *
 * A resposta do clique volta como texto igual ao título da opção, e o chatbot
 * já reconhece opção pelo texto — por isso uma opção só vira botão quando o
 * título cabe inteiro no limite do canal. Cortar o título faria o clique
 * voltar com um texto que não é nenhuma opção.
 */
import { z } from "zod";

export const escolhasSchema = z.object({
  pergunta: z.string().max(4096),
  opcoes: z.array(z.string().min(1).max(80)).min(1).max(10),
  /** Rótulo do botão que abre a lista (quando são mais de 3 opções). */
  rotulo_da_lista: z.string().max(20).optional(),
});
export type Escolhas = z.infer<typeof escolhasSchema>;

/** As escolhas guardadas no `metadata` do envio; lixo ou ausência = null. */
export function escolhasDoEnvio(metadata: unknown): Escolhas | null {
  if (!metadata || typeof metadata !== "object") return null;
  const r = escolhasSchema.safeParse((metadata as Record<string, unknown>).escolhas);
  return r.success ? r.data : null;
}
