/**
 * Pedido de parar DITO EM ÁUDIO (vindo do produto original, adaptado).
 *
 * O bloqueio por "PARAR" mora na ingestão (`lib/channels/pos-entrada.ts`) e lê
 * o corpo da mensagem — que no áudio chega VAZIO. A transcrição só existe
 * depois, quando este worker termina de derivar o áudio. Sem esta peça, "não
 * quero mais receber mensagem" falado passava em branco.
 *
 * Sobre texto TRANSCRITO ninguém bloqueia sozinho: a transcrição pode errar, e
 * bloquear quem não pediu faz o contato sumir. O que sai é um aviso na Central
 * apontando a conversa; quem bloqueia continua sendo a pessoa.
 *
 * Um aviso aberto por conversa (o título é a chave, `kind='other'`, como os
 * outros avisos sem kind próprio). Nunca lança: o áudio já virou texto, que era
 * o que a derivação existia para conseguir.
 */
import { logger } from "@/lib/logger";
import { ehOptOutProvavel, ehPedidoDeOptOut } from "@/lib/opt-out/deteccao";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const TITULO_DO_AVISO_DE_PARAR_EM_AUDIO =
  "O cliente pediu em áudio para não receber mais mensagens";

const CORPO_DO_AVISO =
  "A transcrição do áudio parece um pedido para parar. Abra a conversa, confirme e, se for isso, bloqueie o contato. Nada foi bloqueado automaticamente, porque a transcrição pode errar.";

/** O texto transcrito soa como pedido de parar? Mesma régua da ingestão. */
export function transcricaoPedeParar(transcricao: string): boolean {
  return ehPedidoDeOptOut(transcricao) || ehOptOutProvavel(transcricao);
}

export async function avisarPedidoDeParaEmAudio(
  admin: Admin,
  p: { organizationId: string; conversationId: string; transcricao: string },
): Promise<boolean> {
  if (!transcricaoPedeParar(p.transcricao)) return false;
  try {
    const { data: aberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", p.organizationId)
      .eq("kind", "other")
      .eq("title", TITULO_DO_AVISO_DE_PARAR_EM_AUDIO)
      .eq("ref_id", p.conversationId)
      .eq("status", "open")
      .limit(1);
    if ((aberto ?? []).length > 0) return true;
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: p.organizationId,
      kind: "other",
      severity: "warn",
      title: TITULO_DO_AVISO_DE_PARAR_EM_AUDIO,
      body: CORPO_DO_AVISO,
      ref_kind: "conversation",
      ref_id: p.conversationId,
    });
    if (error) {
      logger.warn("[media-derive] aviso de pedido de parar em áudio não foi gravado", {
        organization_id: p.organizationId,
        error: error.message.slice(0, 160),
      });
      return false;
    }
    return true;
  } catch (erro) {
    // Sem a transcrição no log: é fala do cliente.
    logger.warn("[media-derive] pedido de parar em áudio não foi avaliado", {
      organization_id: p.organizationId,
      erro: erro instanceof Error ? erro.name : typeof erro,
    });
    return false;
  }
}
