/**
 * Desligar um canal OFICIAL da Meta: os dois passos que toda saída precisa dar,
 * na ordem certa. Compartilhado entre quem desliga pela tela
 * (`app/api/v1/channel-sessions/[id]/route.ts`, DELETE) e quem desliga sozinho
 * (`lib/exportacao/exclusao.ts`, no fim do prazo de exportação) — duas cópias
 * deste procedimento divergiriam na primeira correção.
 *
 * 1. `devolverWebhookDoNumero` — pede à Meta que devolva o número à URL do app
 *    (issue #1334). TEM de rodar ANTES de zerar `meta_token_encrypted`: é a
 *    credencial da linha intacta que autoriza a chamada.
 * 2. `revogacaoDoCanalOficial` — o patch que apaga a credencial e rotaciona o
 *    `webhook_path_token`. A URL antiga vira 404 e o canal arquivado é recusado
 *    pela rota de webhook: nenhuma mensagem nova entra, MESMO que o passo 1 tenha
 *    falhado. O passo 1 existe para a Meta parar de tentar, não para nos proteger.
 *
 * A inscrição na WABA (`subscribed_apps`) NÃO entra de propósito: ela é por WABA,
 * compartilhada com os outros números — inclusive de outra organização desta
 * instalação — e desfazê-la apagaria o webhook deles.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

import { desfazerWebhookDoNumero } from "./webhook-override";

export type DesfechoDaDevolucao = "desfeito" | "sem_credencial" | "falhou";

/**
 * Best-effort: Meta fora do ar, token já revogado por lá ou rede caída vão para o
 * log e para o desfecho, e NUNCA lançam — quem chama segue desligando o canal.
 */
export async function devolverWebhookDoNumero(
  admin: SupabaseClient,
  sessao: { meta_token_encrypted: string | null; meta_phone_number_id: string | null },
  contexto: Record<string, unknown>,
): Promise<DesfechoDaDevolucao> {
  if (!sessao.meta_token_encrypted || !sessao.meta_phone_number_id) return "sem_credencial";
  try {
    const token = await decryptWebhookSecret(admin, sessao.meta_token_encrypted);
    if (!token) {
      // Credencial ilegível (cifra de outro ambiente, por exemplo): sem token
      // não há como falar com a Meta pela linha. Fica registrado que o override
      // continuou lá, em vez de a auditoria dizer "tudo certo".
      logger.warn(
        "Canal oficial sem credencial legível — o override do webhook do número fica na Meta",
        { ...contexto, phone_number_id: sessao.meta_phone_number_id },
      );
      return "sem_credencial";
    }
    const desfecho = await desfazerWebhookDoNumero({
      phoneNumberId: sessao.meta_phone_number_id,
      token,
    });
    if (desfecho.ok) return "desfeito";
    logger.warn("A Meta recusou desfazer o override do webhook do número", {
      ...contexto,
      phone_number_id: sessao.meta_phone_number_id,
      etapa: desfecho.etapa,
      motivo: desfecho.motivo,
    });
    return "falhou";
  } catch (err) {
    logger.warn("Falha ao desfazer o override do webhook do número na Meta", {
      ...contexto,
      erro: err instanceof Error ? err.message : String(err),
    });
    return "falhou";
  }
}

/** O patch da revogação: credencial fora, URL do webhook trocada. */
export function revogacaoDoCanalOficial(): { meta_token_encrypted: null; webhook_path_token: string } {
  return { meta_token_encrypted: null, webhook_path_token: randomUUID().replace(/-/g, "") };
}
