/**
 * "Há quem atenda por IA neste número?" — a pergunta do portão de capacidade.
 *
 * Morava dentro do drain (`lib/agent-engine/edge/crm/drain.ts`), que a faz
 * antes de enfileirar o turno para não pagar o pipeline inteiro quando nenhum
 * agente pode responder. O chatbot ("Transferir p/ agentes de IA") precisa da
 * MESMA resposta antes de entregar a conversa: entregar a um número sem agente
 * deixaria o contato falando sozinho. Uma segunda régua aqui divergiria da
 * primeira no primeiro conserto — por isso a consulta é uma só, e os dois leem
 * daqui.
 *
 * O porquê de cada braço (membro e fallback contam pelo que PODEM EXECUTAR, não
 * por existirem) está no comentário da consulta e em
 * `tests/invariants/portao-de-capacidade-mede-quem-executa.test.ts`.
 */
import type pg from "pg";

export type CapacidadeDoNumero = { tem_agente: boolean; tem_roteador: boolean };

export async function capacidadeDoNumero(
  pool: Pick<pg.Pool, "query">,
  organizationId: string,
  channelSessionId: string,
): Promise<CapacidadeDoNumero | undefined> {
  const { rows } = await pool.query<CapacidadeDoNumero>(
    `select
       exists(
         select 1 from ai_agents a
         join ai_agent_versions v on v.id = a.published_version_id
         where a.organization_id = $1 and a.archived_at is null
           and v.status = 'published' and v.channel_session_id = $2
       ) as tem_agente,
       exists(
         select 1 from ai_routers r
         where r.organization_id = $1 and r.is_active
           and r.channel_session_id = $2
           and (
             -- O fallback e os membros contam pelo que PODEM EXECUTAR, não por
             -- existirem. A versão anterior media fallback_agent_id is not null
             -- e a existência de LINHA em ai_router_members — e as duas
             -- sobrevivem à pausa do agente, que só limpa published_version_id.
             -- Um roteador cujos membros foram todos pausados continuava
             -- abrindo o portão: a organização pagava o classificador e o turno
             -- inteiro por mensagem recebida, para responder pelo genérico.
             -- O predicado aqui é o MESMO que loadConversationAgentConfigById
             -- aplica na hora de executar (agent-config.ts) — é o que garante
             -- que o portão não promete um agente que o resolvedor vai recusar.
             exists (
               select 1 from ai_agents fa
               join ai_agent_versions fv on fv.id = fa.published_version_id
               where fa.id = r.fallback_agent_id and fa.organization_id = $1
                 and fa.archived_at is null and fv.status = 'published'
             )
             or exists (
               select 1 from ai_router_members m
               join ai_agents ma on ma.id = m.agent_id
               join ai_agent_versions mv on mv.id = ma.published_version_id
               where m.router_id = r.id and ma.organization_id = $1
                 and ma.archived_at is null and mv.status = 'published'
             )
           )
       ) as tem_roteador`,
    [organizationId, channelSessionId],
  );
  return rows[0];
}

/** Algum agente pode responder por este número agora? */
export function temQuemAtenda(c: CapacidadeDoNumero | undefined): boolean {
  return c !== undefined && (c.tem_agente || c.tem_roteador);
}
