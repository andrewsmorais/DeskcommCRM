/**
 * PASSAR A CONVERSA DE UM AGENTE DE IA PARA OUTRO (vindo do produto original,
 * adaptado ao jeito deste produto).
 *
 * No produto original a passagem só vale com roteador "sticky". Aqui ela usa a
 * mesma régua do chatbot ("Transferir p/ agentes de IA" com agente escolhido):
 * o agente fica gravado na conversa (`active_ai_agent_id`) com
 * `active_intent = 'transferido'` e vale até o atendimento acabar
 * (`service_started_at`) — `agenteEscolhidoPeloChatbot` lê os dois valores, e
 * o turno o respeita antes do roteador. Funciona com ou sem roteador.
 *
 * O único que vence a passagem é o agente da CAMPANHA (a razão de a conversa
 * existir); por isso a ação recusa `conversa_de_campanha` em vez de responder
 * "feito" e o turno seguinte ignorar.
 *
 * A trilha vai para `ai_router_decisions` (migration 0523): desfecho
 * `transferred`, `origem = 'acao'`, de qual agente (`agente_anterior_id`) para
 * qual (`agent_id`), por quê (`motivo`, vocabulário FECHADO — a tabela tem
 * contrato de "sem PII") e quem pediu (`solicitado_por`). Sticky e trilha
 * nascem no MESMO statement.
 */
import type pg from 'pg';
import { z } from 'zod';

import { logger } from '@/lib/logger';

import { tool } from '../edge/llm/run-model-call';
import { loadPublishedAgentConfigById } from './agent-config';
import { agenteDaCampanhaDaConversa } from './agente-da-campanha';

/** Valor de `conversations.active_intent` que marca a passagem entre agentes. */
export const INTENCAO_DA_PASSAGEM = 'transferido';

/** POR QUE a passagem aconteceu — espelhado no CHECK da migration 0523. */
export const MOTIVOS_DA_TRANSFERENCIA_DE_AGENTE = [
  'pedido_do_agente',
  'pedido_do_operador',
  'regra_de_automacao',
] as const;
export type MotivoDaTransferenciaDeAgente = (typeof MOTIVOS_DA_TRANSFERENCIA_DE_AGENTE)[number];

/** Recusas: em todas, NADA é escrito. */
export const CODIGOS_DE_RECUSA_DA_TRANSFERENCIA = [
  'conversa_nao_encontrada',
  'conversa_de_campanha',
  'agente_inexistente',
  'agente_pausado',
  'ja_esta_no_agente',
] as const;
export type CodigoDeRecusaDaTransferencia = (typeof CODIGOS_DE_RECUSA_DA_TRANSFERENCIA)[number];

export class TransferenciaDeAgenteRecusada extends Error {
  constructor(
    readonly codigo: CodigoDeRecusaDaTransferencia,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'TransferenciaDeAgenteRecusada';
  }
}

export interface EntradaDaTransferencia {
  organizationId: string;
  conversationId: string;
  agenteDestinoId: string;
  motivo: MotivoDaTransferenciaDeAgente;
  /** Quem pediu, quando foi uma pessoa. O agente em turno não manda. */
  solicitadoPor?: string | null;
  /** O job do turno, quando a ação nasceu dentro de um turno. */
  jobId?: string | null;
}

export interface ResultadoDaTransferencia {
  agenteAnteriorId: string | null;
  agenteDestinoId: string;
}

export async function transferirAgenteDaConversa(
  db: pg.Pool,
  entrada: EntradaDaTransferencia,
): Promise<ResultadoDaTransferencia> {
  const { organizationId, conversationId, agenteDestinoId, motivo } = entrada;

  const { rows: conversas } = await db.query<{ active_ai_agent_id: string | null }>(
    `select active_ai_agent_id from conversations where organization_id = $1 and id = $2`,
    [organizationId, conversationId],
  );
  const conversa = conversas[0];
  if (conversa === undefined) {
    throw new TransferenciaDeAgenteRecusada('conversa_nao_encontrada', 'Conversa não encontrada nesta organização.');
  }
  if (conversa.active_ai_agent_id === agenteDestinoId) {
    throw new TransferenciaDeAgenteRecusada('ja_esta_no_agente', 'A conversa já está com este agente.');
  }

  const idDaCampanha = await agenteDaCampanhaDaConversa(db, organizationId, conversationId);
  if (idDaCampanha !== null && (await loadPublishedAgentConfigById(db, organizationId, idDaCampanha)) !== null) {
    throw new TransferenciaDeAgenteRecusada(
      'conversa_de_campanha',
      'A conversa nasceu de uma campanha com agente próprio — é ele quem atende.',
    );
  }

  const destino = await loadPublishedAgentConfigById(db, organizationId, agenteDestinoId);
  if (destino === null) {
    throw new TransferenciaDeAgenteRecusada(
      'agente_inexistente',
      'Agente de destino não existe nesta organização ou não tem versão publicada.',
    );
  }
  if (destino.pausedAt) {
    throw new TransferenciaDeAgenteRecusada(
      'agente_pausado',
      'O agente de destino está pausado — com ele a conversa ficaria sem resposta.',
    );
  }

  // UMA escrita: a escolha e a linha de trilha nascem juntas, ou nada nasce.
  const { rowCount } = await db.query(
    `with destino as (
       update conversations
          set active_ai_agent_id = $3, active_intent = $4, active_agent_set_at = now()
        where organization_id = $1 and id = $2
        returning id
     )
     insert into ai_router_decisions
       (organization_id, router_id, conversation_id, intent_name, confidence, agent_id,
        outcome, job_id, origem, agente_anterior_id, motivo, solicitado_por)
     select $1, null, d.id, $4, null, $3,
            'transferred', $5, 'acao', $6, $7, $8
       from destino d`,
    [
      organizationId,
      conversationId,
      agenteDestinoId,
      INTENCAO_DA_PASSAGEM,
      entrada.jobId ?? null,
      conversa.active_ai_agent_id,
      motivo,
      entrada.solicitadoPor ?? null,
    ],
  );
  if ((rowCount ?? 0) === 0) {
    throw new TransferenciaDeAgenteRecusada('conversa_nao_encontrada', 'Conversa não encontrada nesta organização.');
  }

  logger.info('conversa passada para outro agente de IA', {
    organization_id: organizationId,
    conversation_id: conversationId,
    agente_anterior_id: conversa.active_ai_agent_id,
    agente_destino_id: agenteDestinoId,
    motivo,
    solicitado_por: entrada.solicitadoPor ?? null,
  });

  return { agenteAnteriorId: conversa.active_ai_agent_id, agenteDestinoId };
}

/** Teto de agentes oferecidos ao modelo: a descrição de cada um entra no prompt. */
const TETO_DE_DESTINOS = 10;

interface DestinoRow {
  id: string;
  name: string;
  description: string | null;
}

/**
 * A ferramenta `transfer_to_agent` do agente em turno (motivo `pedido_do_agente`).
 *
 * Oferece os OUTROS agentes publicados, ativos e não pausados da organização; o
 * destino é um enum dos NOMES deles, então o modelo não nomeia agente fora da
 * lista. `null` = sem ferramenta neste turno (nenhum outro agente, ou conversa de
 * campanha). Recusa vira resultado da ferramenta (`ok: false`), nunca exceção.
 */
export async function ferramentaDePassagemEntreAgentes(
  db: pg.Pool,
  ctx: {
    organizationId: string;
    conversationId: string;
    agenteAtualId: string;
    jobId: string;
    noteRunError: (err: Error) => void;
  },
) {
  if ((await agenteDaCampanhaDaConversa(db, ctx.organizationId, ctx.conversationId)) !== null) return null;

  const { rows } = await db.query<DestinoRow>(
    `select a.id, a.name, a.description
       from ai_agents a
       join ai_agent_versions v on v.id = a.published_version_id
      where a.organization_id = $1
        and a.id <> $2
        and a.archived_at is null
        and a.is_active
        and v.status = 'published'
        and a.paused_at is null
      order by a.priority desc, a.created_at asc
      limit ${TETO_DE_DESTINOS}`,
    [ctx.organizationId, ctx.agenteAtualId],
  );
  // Nome repetido viraria destino ambíguo no enum: fica o primeiro.
  const porNome = new Map<string, DestinoRow>();
  for (const r of rows) {
    const nome = r.name.trim();
    if (nome && !porNome.has(nome)) porNome.set(nome, r);
  }
  const [primeiro, ...demais] = [...porNome.keys()];
  if (primeiro === undefined) return null;

  return tool({
    description:
      'Passa esta conversa para outro agente de IA. A partir da próxima mensagem do cliente, quem ' +
      'responde é o agente escolhido, até o fim deste atendimento. Use só quando o assunto é ' +
      'claramente de outro agente da lista, e avise o cliente antes. Agentes disponíveis:\n' +
      [...porNome.values()]
        .map((r) => `- ${r.name.trim()}${r.description?.trim() ? `: ${r.description.trim()}` : ''}`)
        .join('\n'),
    inputSchema: z.object({
      destino: z.enum([primeiro, ...demais]).describe('o nome do agente que deve assumir a conversa'),
    }),
    execute: async ({ destino }: { destino: string }) => {
      const alvo = porNome.get(destino);
      if (alvo === undefined) {
        return { ok: false, error: { code: 'agente_inexistente', message: 'Destino fora da lista.' } };
      }
      try {
        await transferirAgenteDaConversa(db, {
          organizationId: ctx.organizationId,
          conversationId: ctx.conversationId,
          agenteDestinoId: alvo.id,
          motivo: 'pedido_do_agente',
          solicitadoPor: null,
          jobId: ctx.jobId,
        });
        return {
          ok: true,
          status: 'transferida',
          message:
            `Conversa passada para o agente "${destino}", que responde a partir da próxima mensagem ` +
            'do cliente. Se ainda não avisou o cliente, avise agora e encerre o turno.',
        };
      } catch (err) {
        if (err instanceof TransferenciaDeAgenteRecusada) {
          return { ok: false, error: { code: err.codigo, message: err.message } };
        }
        ctx.noteRunError(err instanceof Error ? err : new Error(String(err)));
        return {
          ok: false,
          error: { code: 'internal_error', message: 'erro interno ao passar a conversa — siga atendendo.' },
        };
      }
    },
  });
}
