/**
 * Tirar um número do ar NO PROVEDOR sem a tela — para quem desliga sozinho, como
 * a exclusão da conta no fim do prazo de exportação (`lib/exportacao/exclusao.ts`).
 *
 * A feature não pergunta qual é o provedor (invariante 1 da restrição de canal):
 * lê as colunas de `COLUNAS_DO_DESLIGAMENTO`, chama `prepararDesligamento` uma vez
 * e `desligar` por canal, e grava o `patch` devolvido junto com o arquivamento.
 *
 * - Por QR Code: logout e remoção da sessão no servidor do WhatsApp. O cliente já
 *   trata "sessão não existe" como desligada.
 * - Oficial (e qualquer outro provedor): o mesmo procedimento da tela
 *   (`./meta/devolver-webhook.ts`) — pede a devolução do webhook do número ANTES
 *   de apagar a credencial, e o patch troca a URL.
 *
 * A checagem de "conexão em andamento" da tela (`assertWahaConnectionIdle`) não
 * entra: ela protege quem está escaneando o QR agora, e uma conta em exclusão
 * não tem ninguém do outro lado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getWahaClient } from "@/lib/waha/client";

import { CHANNEL_PROVIDER_WAHA } from "./capabilities";
import { devolverWebhookDoNumero, revogacaoDoCanalOficial } from "./meta/devolver-webhook";

/** O `select` que `desligar` precisa: a string nomeia coluna de provedor, por isso mora aqui. */
export const COLUNAS_DO_DESLIGAMENTO =
  "id, provider, waha_session_name, meta_token_encrypted, meta_phone_number_id";

export type CanalParaDesligar = {
  id: string;
  provider: string | null;
  waha_session_name: string | null;
  meta_token_encrypted: string | null;
  meta_phone_number_id: string | null;
};

export type DesfechoDoDesligamento = {
  /** Vai junto no `update` que arquiva o canal (credencial fora, URL trocada…). */
  patch: Record<string, unknown>;
  /** O provedor ficou com o webhook do número apontado para cá (a devolução falhou). */
  webhookPendente: boolean;
};

export type Desligador = {
  /** Quantos canais da lista dependem do servidor do QR Code. */
  readonly canaisPorQrCode: number;
  /**
   * Há canal por QR Code e o servidor dele não está configurado nesta
   * instalação. Quem chama não deve tirar canal nenhum: arquivar sem o logout
   * deixaria o aparelho conectado entregando mensagem para um número "apagado".
   */
  readonly faltaServidorDoQrCode: boolean;
  desligar(
    canal: CanalParaDesligar,
    contexto: Record<string, unknown>,
  ): Promise<DesfechoDoDesligamento>;
};

const porQrCode = (c: CanalParaDesligar) =>
  (c.provider ?? CHANNEL_PROVIDER_WAHA) === CHANNEL_PROVIDER_WAHA;

export function prepararDesligamento(
  db: SupabaseClient,
  canais: readonly CanalParaDesligar[],
): Desligador {
  const canaisPorQrCode = canais.filter(porQrCode).length;
  const servidor = canaisPorQrCode > 0 ? getWahaClient() : null;
  return {
    canaisPorQrCode,
    faltaServidorDoQrCode: canaisPorQrCode > 0 && !servidor,
    async desligar(canal, contexto) {
      if (porQrCode(canal)) {
        if (canal.waha_session_name && servidor) {
          await servidor.logoutSession(canal.waha_session_name);
          await servidor.deleteSession(canal.waha_session_name);
        }
        return { patch: {}, webhookPendente: false };
      }
      // Antes de zerar a credencial: é ela que autoriza a chamada ao provedor.
      const devolucao = await devolverWebhookDoNumero(db, canal, contexto);
      const tinhaOverride = Boolean(canal.meta_token_encrypted && canal.meta_phone_number_id);
      return {
        patch: revogacaoDoCanalOficial(),
        webhookPendente: tinhaOverride && devolucao !== "desfeito",
      };
    },
  };
}
