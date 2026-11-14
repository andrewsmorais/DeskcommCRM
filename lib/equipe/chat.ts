/**
 * CHAT INTERNO DA EQUIPE — o "Chat interno" da Umbler Talk (migration 0515).
 *
 * Uma sala "Geral" com a equipe inteira e conversas diretas entre duas
 * pessoas. Nada vai ao cliente. PURO: as rotas e a tela usam a mesma régua.
 *
 * Toda conversa tem uma CHAVE vista de quem está olhando: `geral`, ou o id da
 * OUTRA pessoa. É a chave da URL, da leitura (`equipe_leituras.conversa`) e
 * da lista da tela.
 */
import { z } from "zod";

export const SALA_GERAL = "geral" as const;
export const CORPO_MAX = 4000;
export const PAGINA = 50;

export const chaveDaConversaSchema = z.union([z.literal(SALA_GERAL), z.string().uuid()]);
export type ChaveDaConversa = z.infer<typeof chaveDaConversaSchema>;

export const novaMensagemSchema = z.object({
  com: chaveDaConversaSchema,
  corpo: z
    .string()
    .trim()
    .min(1, "Escreva a mensagem.")
    .max(CORPO_MAX, `Mensagem com até ${CORPO_MAX} letras.`),
});

export type MensagemDaEquipe = {
  id: string;
  autor_user_id: string;
  destinatario_user_id: string | null;
  corpo: string;
  created_at: string;
};

/** De que conversa é esta mensagem, vista por `eu`? `null` = não é minha. */
export function chaveDaMensagem(m: Pick<MensagemDaEquipe, "autor_user_id" | "destinatario_user_id">, eu: string): ChaveDaConversa | null {
  if (m.destinatario_user_id === null) return SALA_GERAL;
  if (m.autor_user_id === eu) return m.destinatario_user_id;
  if (m.destinatario_user_id === eu) return m.autor_user_id;
  return null;
}

/**
 * Quantas não lidas em cada conversa: mensagens de OUTRA pessoa depois do
 * ponto lido. Sem ponto lido, vale `desde` (quando a pessoa entrou na equipe):
 * quem chega não herda a sala Geral inteira como "não lida".
 */
export function contarNaoLidas(
  mensagens: Array<Pick<MensagemDaEquipe, "autor_user_id" | "destinatario_user_id" | "created_at">>,
  eu: string,
  lidas: Record<string, string>,
  desde: string,
): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const m of mensagens) {
    if (m.autor_user_id === eu) continue;
    const chave = chaveDaMensagem(m, eu);
    if (!chave) continue;
    const ponto = lidas[chave] ?? desde;
    if (Date.parse(m.created_at) > Date.parse(ponto)) saida[chave] = (saida[chave] ?? 0) + 1;
  }
  return saida;
}

/** A primeira linha da mensagem, curta, para a lista de conversas. */
export function previa(corpo: string, max = 80): string {
  const linha = corpo.replace(/\s+/g, " ").trim();
  return linha.length > max ? `${linha.slice(0, max - 1)}…` : linha;
}
