import type pg from "pg";
import type { JobRow } from "../queue/queue";
import { claimOfJob } from "../queue/claim";
import { reconcileAcceptedSend } from "../edge/crm/send-ledger";
import { createRuntimeSendChannel, type RuntimeSendChannel } from "@/lib/channels/runtime";
import { runBeforeSend } from "../guardrails/before-send";
import { deriveLgpdFromContact, type LgpdContactFields } from "../guardrails/lgpd/legal-basis";
import { assertApprovedReplyPg, assertApprovedReplyReceiptPg } from "@/lib/ai/replies/delivery";
import { registrarEnvioDaRespostaAprovada } from "@/lib/ai/decisao/afirmacao-de-fato";
import { createAdminClient } from "@/lib/supabase/admin";
import { StaleServiceBoundaryError } from "@/lib/atendimento/fronteira";
import { withServiceJob } from "@/lib/atendimento/fronteira-server";
import type { InboundTurnDeps } from "./inbound-turn";
export function createApprovedReplyHandler(
  deps: Pick<InboundTurnDeps, "crmCfg" | "log" | "sleep"> & {
    channel?: (pool: pg.Pool) => RuntimeSendChannel;
  },
) {
  return async (job: JobRow, pool: pg.Pool) => {
    const claim = claimOfJob(job);
    if (!claim || job.kind !== "approved_reply" || !job.contact_id)
      throw new StaleServiceBoundaryError();
    const context = { organizationId: job.organization_id, jobId: job.id, jobClaim: claim };
    /**
     * #2923 — A RESPOSTA APROVADA FECHA O PAR DA CONFERÊNCIA DE FATO.
     *
     * NÃO confere de novo: o texto já foi revisado por uma pessoa, e a
     * evidência do turno da prévia não existe mais aqui. A conferência rodou na
     * PRÉVIA (é ela que grava o rótulo do Jev); aqui se grava só o outro lado do
     * par — o que chegou ao cliente —, para o cartão do Jev contar o modo
     * assistido. Best-effort e idempotente: nunca segura nem derruba o envio.
     */
    const registrarConferenciaDeFato = async (): Promise<void> => {
      const draftId = typeof job.payload.draft_id === "string" ? job.payload.draft_id : null;
      if (draftId === null) return;
      try {
        await registrarEnvioDaRespostaAprovada(createAdminClient(), {
          organizationId: job.organization_id,
          runId: draftId,
        });
      } catch (err) {
        deps.log.warn("registro da conferência de fato falhou (best-effort)", {
          job_id: job.id,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
        });
      }
    };
    const settle = async (state: string, error?: string) => {
      await pool.query("select fn_reply_settle($1,$2,$3,$4,$5,$6)", [
        job.organization_id,
        job.id,
        claim.worker_id,
        claim.acquired_at,
        state,
        error ?? null,
      ]);
    };
    let accepted = false;
    try {
      await assertApprovedReplyReceiptPg(pool, context);
      if (
        await reconcileAcceptedSend(pool, { tenantId: job.organization_id, jobId: job.id, seq: 1 })
      ) {
        accepted = true;
        await registrarConferenciaDeFato();
        await settle("sent");
        return;
      }
      await withServiceJob(pool, job, async () => {
        const policy = await assertApprovedReplyPg(pool, context);
        const { rows } = await pool.query<
          LgpdContactFields & { daily_message_limit: number | null }
        >(
          `select c.source,c.consent,c.is_anonymized,s.daily_message_limit from contacts c join channel_sessions s on s.organization_id=c.organization_id and s.id=$3 where c.organization_id=$1 and c.id=$2`,
          [job.organization_id, job.contact_id, policy.channel_session_id],
        );
        if (!rows[0]) throw new StaleServiceBoundaryError();
        const channel =
          deps.channel?.(pool) ??
          createRuntimeSendChannel(pool, { ...deps.crmCfg, agentActorId: policy.agent_id });
        const result = await runBeforeSend({
          pool,
          log: deps.log,
          tenantId: job.organization_id,
          leadId: job.contact_id!,
          jobId: job.id,
          agentId: policy.agent_id,
          approvedReply: context,
          channelSessionId: policy.channel_session_id,
          body: policy.body,
          optedOutThisTurn: false,
          crmDailyLimit: rows[0].daily_message_limit,
          now: new Date(),
          lgpd: deriveLgpdFromContact(rows[0], false),
          sleep: deps.sleep,
          send: async (body) => {
            await assertApprovedReplyPg(pool, context);
            return channel.send({
              tenantId: job.organization_id,
              leadId: job.contact_id,
              jobId: job.id,
              jobClaim: claim,
              seq: 1,
              conversationId: policy.conversation_id,
              body,
            });
          },
        });
        if (result.status === "vetoed") {
          await settle(result.nextAllowedAt ? "queued" : "failed", result.code);
          return;
        }
        // The receipt transaction may commit before its HTTP response is lost.
        // Reconcile that acceptance before retrying an unavailable transport.
        if (result.outcome.kind === "unavailable") {
          await assertApprovedReplyReceiptPg(pool, context);
          if (
            await reconcileAcceptedSend(pool, {
              tenantId: job.organization_id,
              jobId: job.id,
              seq: 1,
            })
          ) {
            accepted = true;
            await registrarConferenciaDeFato();
            await settle("sent");
            return;
          }
        }
        switch (result.outcome.kind) {
          case "sent":
          case "already_sent":
            accepted = true;
            await registrarConferenciaDeFato();
            await settle("sent");
            break;
          case "queued":
            await settle("queued", "channel_unavailable");
            break;
          case "blocked":
            await settle("failed", "blocked");
            break;
          default:
            await settle("retry", "send_failed");
        }
      });
    } catch (error) {
      // Persistence trouble after acceptance must leave the same job recoverable.
      // A later acquisition reconciles its ledger; it must not become a new send.
      if (accepted) throw error;
      if (
        await reconcileAcceptedSend(pool, { tenantId: job.organization_id, jobId: job.id, seq: 1 })
      ) {
        await registrarConferenciaDeFato();
        await settle("sent");
        return;
      }
      await settle(
        error instanceof StaleServiceBoundaryError ? "stale" : "failed",
        error instanceof StaleServiceBoundaryError
          ? "context_changed"
          : error instanceof Error && error.message === "reply_body_changed_reapproval_required"
            ? "body_changed"
            : "delivery_failed",
      );
    }
  };
}
