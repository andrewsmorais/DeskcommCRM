import { randomBytes } from "node:crypto";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export class ErroDaReservaDeCota extends Error {
  constructor(public readonly status: 409 | 503) {
    super(
      status === 409
        ? "Outra alteração desta cota está em andamento. Aguarde e tente novamente."
        : "Não foi possível reservar a cota do plano. Confira a conexão do banco da instalação e tente novamente.",
    );
    this.name = "ErroDaReservaDeCota";
  }
}

// Namespace reservado ao controle de cota; não é recibo de uma rota HTTP.
const ENDPOINT_DA_RESERVA = "billing:quota-reservation";
// Conexões com provedores podem demorar mais que uma escrita no banco.
const DURACAO_DA_RESERVA_MS = 10 * 60 * 1000;

/**
 * A linha existente de idempotency_keys é uma reserva distribuída: o índice
 * único (organization_id, key, endpoint) decide quem pode contar e criar.
 * Falha no banco impede o efeito; não depende de conexão SQL direta ou Redis.
 *
 * A retomada só troca uma reserva já vencida, em UPDATE atômico. O hash bytea
 * aleatório identifica o dono para que a liberação atrasada não apague a
 * reserva de quem a retomou. Não altera recibos de outras operações.
 *
 * Limite: isto é um lease de dez minutos, não uma transação que contém o
 * efeito externo. Uma operação que dure mais que o lease pode coincidir com
 * uma nova operação depois do vencimento. Os chamadores devem usar prazos
 * menores no provedor; uma interrupção deixa a reserva vencer sozinha.
 */
export async function comReservaDeCota<T>(
  orgId: string,
  recurso: "atendentes" | "pipelines" | "whatsapp",
  operacao: () => Promise<T>,
): Promise<T> {
  const chave = `billing:${recurso}`;
  let db: ReturnType<typeof createAdminClient>;
  let proprietario: string;
  try {
    db = createAdminClient();
    proprietario = `\\x${randomBytes(32).toString("hex")}`;
    const agora = new Date();
    const reserva = {
      organization_id: orgId,
      key: chave,
      endpoint: ENDPOINT_DA_RESERVA,
      request_hash: proprietario,
      status_code: null,
      response_body: null,
      expires_at: new Date(agora.getTime() + DURACAO_DA_RESERVA_MS).toISOString(),
    };
    const { error } = await db.from("idempotency_keys").insert(reserva);
    if (error) {
      if (error.code !== "23505") throw new ErroDaReservaDeCota(503);

      // A condição é reavaliada pelo Postgres após uma disputa pela linha:
      // somente um concorrente troca o vencimento pelo lease novo.
      const retomada = await db
        .from("idempotency_keys")
        .update({
          request_hash: proprietario,
          status_code: null,
          response_body: null,
          expires_at: reserva.expires_at,
        })
        .eq("organization_id", orgId)
        .eq("key", chave)
        .eq("endpoint", ENDPOINT_DA_RESERVA)
        .lte("expires_at", agora.toISOString())
        .select("id");
      if (retomada.error || (retomada.data && retomada.data.length > 1)) {
        throw new ErroDaReservaDeCota(503);
      }
      if (retomada.data?.length !== 1) throw new ErroDaReservaDeCota(409);
    }
  } catch (erro) {
    if (erro instanceof ErroDaReservaDeCota) throw erro;
    throw new ErroDaReservaDeCota(503);
  }

  try {
    return await operacao();
  } finally {
    try {
      const { error } = await db
        .from("idempotency_keys")
        .delete()
        .eq("organization_id", orgId)
        .eq("key", chave)
        .eq("endpoint", ENDPOINT_DA_RESERVA)
        .eq("request_hash", proprietario);
      if (error) throw new Error("reserva_nao_liberada");
    } catch {
      // O efeito já terminou. Não trocar seu resultado/erro por falha de
      // limpeza: a linha vence pelo TTL. Nenhum identificador ou erro cru.
      logger.warn("[billing] não foi possível liberar a reserva de cota; ela vencerá pelo prazo");
    }
  }
}
