/**
 * O HORÁRIO DA MENSAGEM AGENDADA CHEGOU (migration 0511) — roda no worker,
 * drenado do `event_log` (`mensagem_agendada.envio_requested`, com
 * `next_attempt_at` = o horário escolhido; `lib/agent-engine/edge/crm/drain.ts`).
 *
 * Três tipos, cada um pelo caminho que a tela já usa:
 *   - mensagem → `sendMessageHandler`, em nome de quem agendou (`sent_via=user`);
 *   - nota     → `conversation_notes`, com o nome de quem agendou;
 *   - chatbot  → o mesmo pedido do botão do robô (`chatbot.inicio_requested`, manual).
 *
 * Regras que não se negociam:
 *   - **uma vez só.** A linha passa de `agendada` a `processando` numa troca
 *     condicional; quem perde a corrida (evento repetido, edição que mudou o
 *     horário) não faz nada. Linha achada em `processando` é envio interrompido
 *     no meio: vira `falhou` SEM reenviar — envio em dobro é pior que não-envio
 *     (mesma régua do recover-stuck-messages).
 *   - **quem agendou ainda responde por ela.** Membro removido, rebaixado a leitor
 *     ou contato bloqueado/anonimizado: não sai, e a conversa ganha nota dizendo
 *     por quê — falha calada seria a mensagem que o cliente esperava e nunca veio.
 */
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { audit } from "@/lib/audit";
import { inicioManual } from "@/lib/chatbot/motor";
import { grafoSchema } from "@/lib/chatbot/passos";

import type { TipoDeAgendada } from "./regras";

type Log = {
  info: (m: string, f?: Record<string, unknown>) => void;
  warn: (m: string, f?: Record<string, unknown>) => void;
};

export type DesfechoDaAgendada = "enviada" | "falhou" | "descartado";

type Linha = {
  id: string;
  conversation_id: string;
  contact_id: string;
  tipo: TipoDeAgendada;
  texto: string | null;
  chatbot_flow_id: string | null;
  criado_por: string;
};

/** Papéis que podem mandar mensagem (o leitor não envia). */
const PAPEIS_QUE_ENVIAM = new Set(["agent", "manager", "admin"]);

export async function executarMensagemAgendada(
  pool: pg.Pool,
  admin: SupabaseClient,
  agendadaId: string,
  organizationId: string,
  log: Log,
): Promise<DesfechoDaAgendada> {
  const { rows: tomadas } = await pool.query<Linha>(
    `update mensagens_agendadas set status = 'processando', updated_at = now()
      where organization_id = $1 and id = $2 and status = 'agendada'
        and enviar_em <= now() + interval '5 seconds'
      returning id, conversation_id, contact_id, tipo, texto, chatbot_flow_id, criado_por`,
    [organizationId, agendadaId],
  );
  const linha = tomadas[0];
  if (!linha) {
    // Envio interrompido no meio de uma rodada anterior: não reenvia.
    const { rows: presas } = await pool.query<Linha>(
      `update mensagens_agendadas
          set status = 'falhou', updated_at = now(),
              erro = 'O envio foi interrompido e não pôde ser confirmado. Nada foi reenviado para não duplicar.'
        where organization_id = $1 and id = $2 and status = 'processando'
        returning id, conversation_id, contact_id, tipo, texto, chatbot_flow_id, criado_por`,
      [organizationId, agendadaId],
    );
    if (presas[0]) await notaDeFalha(pool, organizationId, presas[0], "o envio foi interrompido");
    return "descartado";
  }

  const requestId = `agendada:${linha.id}`;
  const falhar = async (motivo: string): Promise<DesfechoDaAgendada> => {
    await pool.query(
      `update mensagens_agendadas set status = 'falhou', erro = $3, updated_at = now()
        where organization_id = $1 and id = $2`,
      [organizationId, linha.id, motivo.slice(0, 500)],
    );
    await notaDeFalha(pool, organizationId, linha, motivo);
    void audit({
      action: "scheduled_message.failed",
      actorUserId: null,
      organizationId,
      resourceType: "mensagem_agendada",
      resourceId: linha.id,
      requestId,
      bypassedRls: true,
      metadata: { conversation_id: linha.conversation_id, tipo: linha.tipo, motivo: motivo.slice(0, 200) },
    });
    log.info("agendada: não saiu", { agendada_id: linha.id, tipo: linha.tipo });
    return "falhou";
  };

  const { rows: contexto } = await pool.query<{
    role: string | null;
    nome: string | null;
    is_blocked: boolean | null;
    is_anonymized: boolean | null;
    is_group: boolean | null;
    channel_session_id: string | null;
  }>(
    `select uo.role,
            coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as nome,
            ct.is_blocked, ct.is_anonymized, cv.is_group, cv.channel_session_id
       from conversations cv
       join contacts ct on ct.id = cv.contact_id and ct.organization_id = cv.organization_id
       left join user_organizations uo
         on uo.organization_id = cv.organization_id and uo.user_id = $3
        and uo.revoked_at is null and uo.accepted_at is not null
       left join auth.users u on u.id = $3
      where cv.organization_id = $1 and cv.id = $2`,
    [organizationId, linha.conversation_id, linha.criado_por],
  );
  const c = contexto[0];
  if (!c) return falhar("A conversa não existe mais.");
  if (!c.role || !PAPEIS_QUE_ENVIAM.has(c.role))
    return falhar("Quem agendou não faz mais parte da equipe, ou não pode mais enviar mensagens.");
  if (c.is_blocked) return falhar("O contato está bloqueado e não recebe mensagens.");
  if (c.is_anonymized) return falhar("O contato foi anonimizado.");

  try {
    if (linha.tipo === "mensagem") {
      const enviada = await sendMessageHandler(
        admin,
        {
          organization_id: organizationId,
          actor: { type: "user", id: linha.criado_por, role: c.role },
          requestId,
        },
        {
          conversation_id: linha.conversation_id,
          type: "text",
          body: linha.texto ?? "",
        } as Parameters<typeof sendMessageHandler>[2],
      );
      if (enviada.status === "failed")
        return falhar(enviada.error_message ?? "O WhatsApp recusou a mensagem.");
    } else if (linha.tipo === "nota") {
      await pool.query(
        `insert into conversation_notes (organization_id, conversation_id, body, created_by_user_id, created_by_name)
         values ($1, $2, $3, $4, $5)`,
        [organizationId, linha.conversation_id, linha.texto ?? "", linha.criado_por, c.nome],
      );
    } else {
      if (c.is_group) return falhar("O chatbot não atende grupos.");
      if (!c.channel_session_id) return falhar("A conversa não tem número de WhatsApp.");
      const { rows: fluxos } = await pool.query<{ id: string; is_active: boolean; grafo: unknown }>(
        `select id, is_active, grafo from chatbot_flows where organization_id = $1 and id = $2`,
        [organizationId, linha.chatbot_flow_id],
      );
      const g = grafoSchema.safeParse(fluxos[0]?.grafo);
      if (!fluxos[0]?.is_active || !g.success || !inicioManual(g.data))
        return falhar('O chatbot foi desligado, apagado ou perdeu o passo "Iniciar manualmente".');
      const boundary = await beginServiceAtOrigin(
        admin,
        organizationId,
        linha.contact_id,
        c.channel_session_id,
      );
      await pool.query(
        `insert into event_log (organization_id, event_type, entity_kind, entity_id, payload, metadata)
         values ($1, 'chatbot.inicio_requested', 'contact', $2, $3::jsonb, $4::jsonb)`,
        [
          organizationId,
          linha.contact_id,
          JSON.stringify({
            flow_id: linha.chatbot_flow_id,
            contact_id: linha.contact_id,
            conversation_id: boundary.conversation_id,
            channel_session_id: c.channel_session_id,
            boundary,
            variaveis: {},
            regra_id: null,
            manual: true,
            iniciado_por: linha.criado_por,
          }),
          JSON.stringify({ source: "mensagem_agendada", agendada_id: linha.id, user_id: linha.criado_por }),
        ],
      );
    }
  } catch (err) {
    return falhar(
      `Não foi possível enviar: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
    );
  }

  await pool.query(
    `update mensagens_agendadas set status = 'enviada', enviado_em = now(), erro = null, updated_at = now()
      where organization_id = $1 and id = $2`,
    [organizationId, linha.id],
  );
  void audit({
    action: "scheduled_message.sent",
    actorUserId: linha.criado_por,
    organizationId,
    resourceType: "mensagem_agendada",
    resourceId: linha.id,
    requestId,
    bypassedRls: true,
    metadata: { conversation_id: linha.conversation_id, tipo: linha.tipo },
  });
  return "enviada";
}

const NOME_DO_TIPO: Record<TipoDeAgendada, string> = {
  mensagem: "A mensagem agendada",
  nota: "A nota agendada",
  chatbot: "O chatbot agendado",
};

/** A falha aparece na conversa, para a equipe — o contato não vê. */
async function notaDeFalha(pool: pg.Pool, organizationId: string, linha: Linha, motivo: string) {
  await pool.query(
    `insert into conversation_notes (organization_id, conversation_id, body, created_by_name)
     values ($1, $2, $3, 'Agendamento')`,
    [organizationId, linha.conversation_id, `${NOME_DO_TIPO[linha.tipo]} não saiu: ${motivo}`.slice(0, 2000)],
  );
}
