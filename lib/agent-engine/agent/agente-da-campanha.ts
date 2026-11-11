/**
 * Quem atende quem responde a uma CAMPANHA.
 *
 * ═══ A dívida que este arquivo paga ═══
 *
 * `lib/ai/elegibilidade/campanha.ts` declarou, por escrito e antes desta
 * entrega: "o match de campanha só torna o contato elegível; quem assume o
 * turno é sempre o roteador / agente publicado da sessão. Encaminhar por
 * campanha exige levar o `agent_id` (…) e o `resolve-turn-agent` respeitá-lo —
 * não feito nesta entrega". O campo `agent_id` existia no schema de lá e era
 * ignorado.
 *
 * ═══ Por que importa, e não é preferência ═══
 *
 * Quem aborda gente que nunca falou com a empresa segue um roteiro que não é o
 * do atendimento: apresenta quem fala, explica de onde veio o contato, oferece
 * a saída. A LIA-2026-01 do controlador PROMETE que quem perguntar "de onde
 * veio meu contato?" recebe a resposta exata na hora — e essa promessa só se
 * cumpre se QUEM ATENDE souber respondê-la. Com o agente do número atendendo, a
 * promessa depende de alguém ter lembrado de pôr isso no material dele.
 *
 * ═══ Só conversa que NASCE da campanha ═══
 *
 * Decisão do dono (2026-09-19). O contato antigo que responde a uma reativação
 * continua com quem já o atendia; seria hostil trocar o atendente de alguém no
 * meio da relação porque ele reagiu a uma mensagem. Por isso a consulta exige
 * que a conversa seja a MESMA que a campanha criou (`campaign_recipients.
 * conversation_id`), e não "esse contato está em alguma campanha".
 */
import type pg from 'pg';

/**
 * Teto de tempo da consulta.
 *
 * Um `await` sem limite no caminho quente do agente é defeito por si só: num dia
 * de banco lento ou de lock preso, ele seguraria o TURNO INTEIRO — a pessoa fica
 * sem resposta por causa de um enfeite de roteamento. Meio segundo é muito mais
 * que uma leitura indexada por `conversation_id` precisa, e estourar aqui só
 * significa seguir pela régua do número.
 */
const TETO_MS = 500;

/**
 * O agente declarado pela campanha que criou ESTA conversa, se houver.
 *
 * `null` em qualquer dúvida: campanha sem agente, conversa que não nasceu de
 * campanha, erro de consulta, ou banco que demorou demais. Falhar aqui não pode
 * calar o atendimento — o turno segue pela régua normal (roteador, agente do
 * número, genérico).
 */
export async function agenteDaCampanhaDaConversa(
  db: pg.Pool,
  tenantId: string,
  conversationId: string,
): Promise<string | null> {
  try {
    const consulta = db.query<{ agent_id: string | null }>(
      `select c.agent_id
         from campaign_recipients r
         join campaigns c on c.id = r.campaign_id
        where r.organization_id = $1
          and r.conversation_id = $2
          and c.agent_id is not null
        order by r.sent_at desc nulls last
        limit 1`,
      [tenantId, conversationId],
    );
    // `Promise.race` e não `statement_timeout`: o teto tem de valer também
    // quando a conexão nem chega a ser obtida (pool esgotado), que é
    // exatamente o caso em que o turno ficaria pendurado.
    const resultado = await Promise.race([
      consulta,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TETO_MS)),
    ]);
    if (resultado === null) return null;
    return resultado.rows[0]?.agent_id ?? null;
  } catch {
    return null;
  }
}

/**
 * O agente que o CHATBOT escolheu para esta conversa, neste atendimento.
 *
 * O passo "Transferir p/ agentes de IA" pode nomear o agente (11/11/2026, como
 * na Umbler Talk); a escolha fica em `conversations.active_ai_agent_id` com
 * `active_intent = 'chatbot'` e vale até o atendimento acabar
 * (`service_started_at`): o atendimento seguinte começa do zero. Mesma régua de
 * falha da campanha — `null` em qualquer dúvida, o turno segue pela régua normal.
 */
export async function agenteEscolhidoPeloChatbot(
  db: pg.Pool,
  tenantId: string,
  conversationId: string,
): Promise<string | null> {
  try {
    const consulta = db.query<{ agent_id: string | null }>(
      `select c.active_ai_agent_id as agent_id
         from conversations c
        where c.organization_id = $1
          and c.id = $2
          and c.active_intent = 'chatbot'
          and c.active_ai_agent_id is not null
          and c.active_agent_set_at >= coalesce(c.service_started_at, c.created_at)`,
      [tenantId, conversationId],
    );
    const resultado = await Promise.race([
      consulta,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TETO_MS)),
    ]);
    if (resultado === null) return null;
    return resultado.rows[0]?.agent_id ?? null;
  } catch {
    return null;
  }
}
