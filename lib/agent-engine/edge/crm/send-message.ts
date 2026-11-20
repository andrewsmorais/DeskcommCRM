import { assertAgentOperationPg } from '@/lib/ai/agents/operation';
import type { AgentOperationContext } from '@/lib/ai/agents/operation';
import { assertApprovedReplyPg, type ApprovedReplyContext } from '@/lib/ai/replies/delivery';
import { assertMeetingDeliveryPg, type MeetingDeliveryContext } from '@/lib/agenda/meet-delivery';
import type { JobClaim } from '../../queue/claim';
import { assertAgendaEffectPg } from '@/lib/agenda/efeito';
import { AgendaPuladoError } from '@/lib/agenda/escolha-no-envio';
import { escolhaDoFluxoPg } from '@/lib/agenda/escolha-no-envio-leitura';
import { AgendaDeferredError } from '@/lib/agenda/protecao-followup';
import { StaleServiceBoundaryError } from '@/lib/atendimento/fronteira';
import { requireCurrentServiceBoundary } from '@/lib/atendimento/fronteira-server';
import { parseServiceBoundary } from '@/lib/atendimento/fronteira';
/**
 * Borda de saída pós-fusão: envio de mensagem SEMPRE via `sendMessageHandler` do
 * próprio app (app/api/v1/messages/_handler.ts) — o handler insere a linha
 * outbound, envia pelo WAHA, atualiza conversa, audita e emite evento; e dá de
 * graça o guard is_blocked (ApiError 403). A tool `send_message` do agente chama
 * ESTA função depois da cadeia de guardrails; nenhum output de modelo vira
 * mensagem sem passar por aqui.
 *
 * Idempotência (o handler NÃO tem idempotency key própria — o ledger cobre):
 *   1. transação lógica: insert em `send_ledger` (unique (job_id, seq)); o
 *      `send_ledger.id` É a idempotency_key, enviada em `metadata.idempotency_key`
 *      da mensagem;
 *   2. chamada ao handler; 'sent' → accepted; 'queued'/'failed' → registrados;
 *   3. retry pós-crash: 'accepted' pula; 'requested' PRIMEIRO procura em
 *      `messages` uma linha com essa idempotency_key (o crash pode ter sido
 *      DEPOIS do envio) — achou, reconcilia o ledger sem reenviar; 'failed'
 *      rotaciona o id (tentativa lógica nova).
 */
import { sendWithLedger, pgSendLedger, type SendOutcome } from './send-ledger';
import { logger } from '@/lib/logger';
import { registrarCustoDeVoz, resolverCaminhoDeVoz, VozLedgerTerminalError } from './send-voice';
import type { FormatoDaVoz } from '@/lib/ai/voz/formato';
import { extraForaDaOrganizacao } from '@/lib/billing/extras';
export type { SendOutcome, SendLedgerStatus } from './send-ledger';

import { ApiError } from '@/lib/api/types';
import { sendMessageHandler } from '@/app/api/v1/messages/_handler';
import type { Message } from '@/lib/types/messaging';

import type { Queryable } from '../../queue/queue';
import { cancelJob, rescheduleJob, type JobRow } from '../../queue/queue';
import { cancelPendingCronsForLead } from '../../cron/scheduler';
import { CrmTransportError, type CrmEdgeConfig } from './mcp-client';

/** Erro de negócio não classificado do handler (ex.: conversa inexistente) — ledger fica 'requested'. */
export class SendToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendToolError';
  }
}

export interface SendMessageInput {
  agentOperation?: AgentOperationContext;
  jobClaim?: JobClaim;
  tenantId: string;
  leadId: string | null;
  jobId: string;
  /** Posição da mensagem no turno (1..n) — com jobId forma a identidade da intenção. */
  seq: number;
  conversationId: string;
  body: string;
  /**
   * Presente = envio de TEMPLATE. O `body` continua sendo o texto RENDERIZADO — é
   * ele que entra no hash de idempotência e é ele que os gates de conteúdo avaliaram.
   * Trocar a chave por "nome do template" faria dois envios com valores diferentes
   * colidirem no ledger e o segundo virar `already_sent` sem ter saído.
   */
  template?: { name: string; language: string; values: Record<string, string> };
  /** Presente = imagem da pasta da conversa em `whatsapp-media`; `body` é a legenda. */
  media?:
    | { storagePath: string; mime: string }
    | { url: string; mime: string; type: 'image' | 'video' | 'audio' | 'document' };
  /**
   * Presente = esta mensagem sai como NOTA DE VOZ (ElevenLabs), não texto.
   *
   * `body` SEGUE sendo o texto FALADO (já limpo por `textoFalavel`) — é ele que
   * entra no hash de idempotência do ledger. `textoOriginal` vira
   * `media_derived_text` para a conversa não ficar cega (busca, LGPD,
   * classificadores leem essa coluna em mídia).
   *
   * Ausente = comportamento desta função idêntico a antes.
   */
  voz?: {
    textoOriginal: string;
    apiKey: string;
    voiceId: string;
    modelId?: string;
    /** mp3 ou ogg/opus — o que o canal da conversa entrega como nota de voz (`lib/ai/voz/formato.ts`). */
    formato?: FormatoDaVoz;
    /**
     * Grava os bytes no Storage e devolve o path. O path PRECISA começar com
     * `${organizationId}/${conversationId}/` (`isMediaPathOwnedBy`).
     */
    upload: (audio: Buffer, mimeType: string) => Promise<string>;
  };
}

/**
 * O corpo que o handler de mensagens recebe: texto, template ou imagem da
 * conversa. Exportado para o teste — o tipo decide o caminho no handler, e um
 * `type` errado manda a foto como texto sem ninguém ver.
 */
export function corpoDoEnvio(
  input: SendMessageInput,
  idempotencyKey: string,
  /** A nota de voz já sintetizada (`input.voz` resolvido); ausente = texto/template/mídia. */
  voz?: { mediaStoragePath: string; mimeType: string },
): Parameters<typeof sendMessageHandler>[2] {
  return {
    conversation_id: input.conversationId,
    ...(voz
      ? { type: 'audio' as const, media_storage_path: voz.mediaStoragePath, media_mime: voz.mimeType }
      : input.template
      ? {
          type: 'template' as const,
          template_name: input.template.name,
          template_language: input.template.language,
          template_values: input.template.values,
        }
      : input.media
        ? 'url' in input.media
          ? {
              // Mídia por URL de um passo automático: o `type` vem decidido e o
              // handler é quem busca e confere o arquivo (anti-SSRF).
              type: input.media.type,
              media_url: input.media.url,
              media_mime: input.media.mime,
            }
          : {
              type: 'image' as const,
              media_storage_path: input.media.storagePath,
              media_mime: input.media.mime,
            }
        : { type: 'text' as const }),
    // Foto sem legenda vai sem `body`: o schema do envio pede corpo não vazio.
    ...(input.body !== '' || !input.media ? { body: input.body } : {}),
    metadata: { idempotency_key: idempotencyKey },
  };
}

/** Fallback do ator ai_agent quando não há agente publicado (cfg.agentActorId). */
export const AGENT_ACTOR_ID = 'agent-engine';

/**
 * Envia UMA mensagem do turno pelo handler do app. Intenção exactly-once,
 * entrega at-least-once: throws (transporte) deixam o ledger em 'requested' —
 * o retry reconcilia por `messages.metadata.idempotency_key` antes de reenviar.
 */
export async function sendTurnMessage(
  db: Queryable,
  cfg: CrmEdgeConfig,
  input: SendMessageInput,
): Promise<SendOutcome> {
  if (input.agentOperation) await assertAgentOperationPg(db, input.agentOperation);
  const { rows: sourceJobs } = await db.query<{ kind: string; payload: Record<string, unknown> }>(
    'select payload,kind from job_queue where id=$1 and organization_id=$2 and contact_id=$3',
    [input.jobId, input.tenantId, input.leadId],
  );
  await requireCurrentServiceBoundary(
    db,
    parseServiceBoundary(sourceJobs[0]?.payload.service_boundary),
  );
  // A escolha do FLUXO ("quando o contato tiver horário marcado") viaja no
  // contexto: sem ela a guarda abaixo leria o padrão (`adiar`) e desfaria o que
  // o fluxo publicou — um fluxo em `enviar` seguiria sendo segurado.
  const enrollmentDoJob =
    typeof sourceJobs[0]?.payload.followup_enrollment_id === 'string'
      ? sourceJobs[0].payload.followup_enrollment_id
      : undefined;
  const proactiveContext =
    sourceJobs[0]?.kind === 'followup_turn' && input.leadId
      ? {
          organizationId: input.tenantId,
          contactId: input.leadId,
          jobId: input.jobId,
          jobClaim: input.jobClaim,
          enrollmentId: enrollmentDoJob,
          ...(enrollmentDoJob
            ? { escolhaNoEnvio: await escolhaDoFluxoPg(db, input.tenantId, enrollmentDoJob) }
            : {}),
          nodeId:
            typeof sourceJobs[0].payload.node_id === 'string'
              ? sourceJobs[0].payload.node_id
              : undefined,
        }
      : undefined;
  if (proactiveContext) await assertAgendaEffectPg(db, proactiveContext);
  let meetingDelivery: MeetingDeliveryContext | undefined;
  if (sourceJobs[0]?.kind === 'transactional_delivery') {
    if (!input.jobClaim) throw new StaleServiceBoundaryError();
    meetingDelivery = {
      organizationId: input.tenantId,
      jobId: input.jobId,
      jobClaim: input.jobClaim,
    };
    await assertMeetingDeliveryPg(db, meetingDelivery);
  }
  let approvedReply: ApprovedReplyContext | undefined;
  if (sourceJobs[0]?.kind === 'approved_reply') {
    if (!input.jobClaim) throw new StaleServiceBoundaryError();
    approvedReply = {
      organizationId: input.tenantId,
      jobId: input.jobId,
      jobClaim: input.jobClaim,
    };
    const policy = await assertApprovedReplyPg(db, approvedReply);
    if (policy.body !== input.body || policy.conversation_id !== input.conversationId)
      throw new StaleServiceBoundaryError();
  }
  // ─── Voz: resolve o ÁUDIO antes do ledger decidir o que fazer ───
  //
  // A síntese é cara e idempotente pela MESMA identidade (job_id, seq) que o
  // ledger usa (`send-voice.ts`): um retry reusa o áudio já sintetizado em vez
  // de pagar de novo. Qualquer falha da síntese (rede, ElevenLabs, Storage)
  // cai para TEXTO: o cliente recebe a resposta, só não é a voz.
  let vozResolvida: { mediaStoragePath: string; mimeType: string } | undefined;
  // O extra de nota de voz é conferido de novo AQUI, na hora de enviar, e não
  // só no começo do turno (`voz-do-turno.ts`): um envio que volta depois — job
  // reagendado com a linha `queued`, turno longo, resposta aprovada mais tarde —
  // reaproveitaria do ledger o áudio já sintetizado e mandaria nota de voz a
  // uma empresa cujo extra foi desligado no meio (auditoria de planos de
  // 19/11, achado 22). Sem o extra, sai em TEXTO, como na falha de síntese.
  const vozDesligada =
    input.voz !== undefined && (await extraForaDaOrganizacao(input.tenantId, 'nota_de_voz'));
  if (input.voz && !vozDesligada) {
    try {
      const r = await resolverCaminhoDeVoz({
        store: pgSendLedger(db),
        identidade: { tenantId: input.tenantId, leadId: input.leadId, jobId: input.jobId, seq: input.seq },
        textoFalado: input.body,
        voz: {
          apiKey: input.voz.apiKey,
          voiceId: input.voz.voiceId,
          modelId: input.voz.modelId,
          ...(input.voz.formato ? { formato: input.voz.formato } : {}),
        },
        upload: input.voz.upload,
      });
      vozResolvida = { mediaStoragePath: r.mediaStoragePath, mimeType: r.mimeType };
      // O custo entra só quando a síntese ACONTECEU agora — retry que reusou o
      // áudio não pagou de novo.
      if (r.sintetizouAgora) {
        registrarCustoDeVoz({
          supabase: cfg.supabase,
          organizationId: input.tenantId,
          jobId: input.jobId,
          caracteres: r.caracteres,
          modelId: input.voz.modelId ?? 'eleven_multilingual_v2',
        });
      }
    } catch (err) {
      if (err instanceof VozLedgerTerminalError) {
        return err.kind === 'already_sent'
          ? { kind: 'already_sent', idempotencyKey: err.key, crmMessageId: err.crmMessageId }
          : { kind: 'blocked', idempotencyKey: err.key };
      }
      logger.warn('[send-message] síntese de voz falhou — respondendo em texto', {
        organization_id: input.tenantId,
        job_id: input.jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return sendWithLedger(pgSendLedger(db), input, async (idempotencyKey, messageId) => {
    let message: Message;
    try {
      message = await sendMessageHandler(
        cfg.supabase,
        {
          organization_id: input.tenantId,
          actor: { type: 'ai_agent', id: cfg.agentActorId ?? AGENT_ACTOR_ID, role: 'manager' },
          requestId: idempotencyKey,
          serviceBoundary: parseServiceBoundary(sourceJobs[0]?.payload.service_boundary),
          proactiveContext,
          meetingDelivery,
          approvedReply,
          agentOperation: input.agentOperation,
          internalMessageId: messageId,
          // Nunca vem do corpo de uma requisição pública — só este seam a preenche.
          ...(input.voz && vozResolvida ? { aiVoiceDerivedText: input.voz.textoOriginal } : {}),
        },
        corpoDoEnvio(input, idempotencyKey, vozResolvida),
      );
    } catch (err) {
      // O PULO por compromisso não é falha de transporte: quem chama registra
      // `skipped` com o motivo.
      if (err instanceof AgendaPuladoError || err instanceof AgendaDeferredError || err instanceof StaleServiceBoundaryError) throw err;
      if (err instanceof ApiError && err.status === 403) {
        throw err;
      }
      if (err instanceof ApiError && err.status === 404) {
        await touchLedgerError(db, input.tenantId, idempotencyKey, 'conversa não encontrada');
        throw new SendToolError('envio recusado: conversa não encontrada');
      }
      // Qualquer outra falha (Supabase fora, erro interno do handler): transiente —
      // o ledger fica 'requested' e o replay reconcilia pela key.
      const msg = err instanceof Error ? err.message : String(err);
      await touchLedgerError(db, input.tenantId, idempotencyKey, msg);
      throw new CrmTransportError(`handler de envio indisponível: ${msg.slice(0, 120)}`);
    }

    return message;
  });
}

async function touchLedgerError(
  db: Queryable,
  org: string,
  id: string,
  errorText: string,
): Promise<void> {
  await db.query(
    `update send_ledger set last_error = $2, updated_at = now() where id = $1 and organization_id = $3`,
    [id, errorText.slice(0, 300), org],
  );
}

export type SendDisposition =
  /** Job cancelado em definitivo (veto is_blocked) — não re-tenta. */
  | { action: 'canceled'; job: JobRow | null }
  /** Job devolvido a 'pending' com run_after adiado, sem consumir attempts. */
  | { action: 'requeued'; job: JobRow | null }
  /** Nada a fazer com o job aqui: 'sent'/'already_sent' seguem para complete; 'failed' segue para failJob. */
  | { action: 'none' };

/**
 * Disposição do JOB conforme o outcome do envio:
 * - blocked → cancela o job (terminal — opt-out não é incidente) e cancela TODOS
 *   os follow-ups agendados do contato (irrevogável, regra dura nº 2). A fonte
 *   do bloqueio JÁ é contacts.is_blocked — não existe mais cache a atualizar;
 * - queued → reagenda com `delayMs` (knob SEND_QUEUED_RETRY_MS) SEM consumir
 *   attempts — sessão fora não pode matar mensagem de lead saudável;
 * - demais → responsabilidade do worker (complete/failJob pelos caminhos normais).
 */
export async function applySendOutcome(
  db: Queryable,
  outcome: SendOutcome,
  job: {
    jobId: string;
    workerId: string;
    tenantId: string;
    leadId: string | null;
    jobClaim?: JobClaim;
  },
  knobs: { queuedRetryDelayMs: number },
): Promise<SendDisposition> {
  switch (outcome.kind) {
    case 'blocked': {
      const canceled = await cancelJob(
        db,
        job.jobId,
        job.workerId,
        'envio vetado pelo sink: contato bloqueado (is_blocked) — opt-out irrevogável',
        job.jobClaim?.acquired_at,
      );
      if (job.leadId) {
        await cancelPendingCronsForLead(db, job.tenantId, job.leadId);
      }
      return { action: 'canceled', job: canceled };
    }
    case 'queued': {
      const requeued = await rescheduleJob(db, job.jobId, job.workerId, {
        delayMs: knobs.queuedRetryDelayMs,
        acquiredAt: job.jobClaim?.acquired_at,
        reason: 'sessão do canal fora (resposta queued) — reagendado sem consumir attempts',
      });
      return { action: 'requeued', job: requeued };
    }
    default:
      return { action: 'none' };
  }
}
