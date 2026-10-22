/**
 * Liga o motor do chatbot (lib/chatbot/motor.ts, puro) ao WhatsApp e ao CRM.
 *
 * Chamado pelo drain do agente (lib/agent-engine/edge/crm/drain.ts) para cada
 * mensagem que chega, ANTES de decidir se a IA responde:
 *   - `atendeu`    → o chatbot conduziu esta mensagem; a IA não é acordada;
 *   - `{ adiarAte }` → fora da janela de envio do número; o evento volta quando ela abrir;
 *   - `nao_atende` → nenhum fluxo para esta conversa; segue o caminho da IA.
 *
 * Sem IA em ponto nenhum. Envia pelo mesmo caminho das automações
 * (`sendMessageHandler` + espaçamento entre mensagens + janela do número), com
 * as mesmas guardas do contato. Falha ao ler o fluxo devolve `nao_atende`
 * (fail-open): um erro do chatbot não pode calar a conversa.
 */
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrganizationBilling } from "@/lib/billing";
import { decidirAcessoPeloPlano } from "@/lib/billing/exigencia";
import { adiarAteAJanelaAbrir } from "@/lib/automation/janela-do-canal";
import { espacarEnvio } from "@/lib/automation/throttle";
import { parseServiceBoundary } from "@/lib/atendimento/fronteira";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { grafoSchema, type Grafo } from "./passos";
import {
  continuarFluxo,
  iniciarFluxo,
  pontoDePartida,
  type Efeito,
  type ResultadoDoTurno,
  type SessaoDoChatbot,
} from "./motor";

/** Depois de terminar, o fluxo só recomeça na mesma conversa passado este tempo. */
export const HORAS_PARA_RECOMECAR = 6;

export type DesfechoDoChatbot = "atendeu" | "nao_atende" | { adiarAte: string };

export type EntradaDoChatbot = {
  organizationId: string;
  conversationId: string;
  contactId: string;
  channelSessionId: string | null;
  inboundMessageId: string;
};

type Log = {
  info: (m: string, f?: Record<string, unknown>) => void;
  warn: (m: string, f?: Record<string, unknown>) => void;
};

type SessaoGravada = {
  id: string;
  flow_id: string;
  no_atual: string | null;
  tentativas: number;
  collected_data: Record<string, unknown> | null;
  grafo: unknown;
  is_active: boolean;
};

const TERMINAIS = new Set(["completed", "transferred"]);

function dadosDeTexto(v: Record<string, unknown> | null): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [k, val] of Object.entries(v ?? {})) if (typeof val === "string") saida[k] = val;
  return saida;
}

export async function atenderPeloChatbot(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  log: Log,
): Promise<DesfechoDoChatbot> {
  let sessaoEsperando: SessaoGravada | null;
  try {
    const { rows } = await pool.query<SessaoGravada>(
      `select s.id, s.flow_id, s.no_atual, s.tentativas, s.collected_data, f.grafo, f.is_active
         from chatbot_sessions s
         join chatbot_flows f on f.id = s.flow_id and f.organization_id = s.organization_id
        where s.organization_id = $1 and s.conversation_id = $2 and s.status = 'waiting_input'
        order by s.updated_at desc
        limit 1`,
      [e.organizationId, e.conversationId],
    );
    sessaoEsperando = rows[0] ?? null;
  } catch (err) {
    log.warn("chatbot: leitura da sessão falhou — segue sem chatbot", {
      erro: String(err).slice(0, 120),
    });
    return "nao_atende";
  }

  // Fluxo desligado enquanto a conversa esperava: encerra a sessão e sai.
  if (sessaoEsperando && !sessaoEsperando.is_active) {
    await encerrarSessao(pool, e.organizationId, sessaoEsperando.id, "completed");
    sessaoEsperando = null;
  }

  // Quem está com a conversa? Atendente humano assumiu, ou contato bloqueado:
  // o chatbot sai do caminho (e solta a sessão que esperava).
  const { rows: estado } = await pool.query<{
    assignee_kind: string | null;
    is_blocked: boolean | null;
    timezone: string | null;
  }>(
    `select c.assignee_kind, ct.is_blocked, o.timezone
       from conversations c
       join contacts ct on ct.id = c.contact_id and ct.organization_id = c.organization_id
       join organizations o on o.id = c.organization_id
      where c.organization_id = $1 and c.id = $2 and c.is_group = false`,
    [e.organizationId, e.conversationId],
  );
  const conversa = estado[0];
  if (!conversa || conversa.assignee_kind === "user" || conversa.is_blocked === true) {
    if (sessaoEsperando)
      await encerrarSessao(pool, e.organizationId, sessaoEsperando.id, "completed");
    return "nao_atende";
  }

  let fluxoId: string;
  let grafo: Grafo;
  let sessaoAnterior: SessaoDoChatbot | null = null;
  let sessaoId: string | null = null;

  const { rows: msg } = await pool.query<{ body: string | null; type: string | null }>(
    `select body, type from messages where organization_id = $1 and id = $2`,
    [e.organizationId, e.inboundMessageId],
  );
  const texto = msg[0]?.type === "text" || msg[0]?.body ? (msg[0]?.body ?? null) : null;

  if (sessaoEsperando) {
    const g = grafoSchema.safeParse(sessaoEsperando.grafo);
    if (!g.success) {
      await encerrarSessao(pool, e.organizationId, sessaoEsperando.id, "completed");
      return "nao_atende";
    }
    fluxoId = sessaoEsperando.flow_id;
    grafo = g.data;
    sessaoId = sessaoEsperando.id;
    sessaoAnterior = {
      no_atual: sessaoEsperando.no_atual,
      status: "waiting_input",
      tentativas: sessaoEsperando.tentativas ?? 0,
      dados: dadosDeTexto(sessaoEsperando.collected_data),
    };
  } else {
    const { rows: fluxos } = await pool.query<{ id: string; grafo: unknown }>(
      `select id, grafo from chatbot_flows
        where organization_id = $1 and is_active
        order by updated_at desc
        limit 1`,
      [e.organizationId],
    );
    if (!fluxos[0]) return "nao_atende";
    const g = grafoSchema.safeParse(fluxos[0].grafo);
    if (!g.success) return "nao_atende";
    fluxoId = fluxos[0].id;
    grafo = g.data;

    // Já rodou nesta conversa há pouco: não recomeça a cada "obrigado".
    const { rows: recente } = await pool.query<{ id: string }>(
      `select id from chatbot_sessions
        where organization_id = $1 and conversation_id = $2 and flow_id = $3
          and coalesce(ended_at, updated_at) > now() - make_interval(hours => $4)`,
      [e.organizationId, e.conversationId, fluxoId, HORAS_PARA_RECOMECAR],
    );
    if (recente[0]) return "nao_atende";
  }

  const inicio = sessaoAnterior
    ? null
    : pontoDePartida(grafo, { channelSessionId: e.channelSessionId, mensagem: texto });
  if (!sessaoAnterior && !inicio) return "nao_atende";

  // Organização sem assinatura ativa: o chatbot também para (mesma regra da IA).
  const acesso = decidirAcessoPeloPlano(await getOrganizationBilling(e.organizationId));
  if (!acesso.liberado) {
    log.info("chatbot: organização sem assinatura ativa — não responde", { motivo: acesso.motivo });
    return "atendeu";
  }

  // Janela de envio do número (anti-bloqueio). Fora dela, o evento volta depois.
  if (e.channelSessionId) {
    const abre = await adiarAteAJanelaAbrir(admin, e.organizationId, e.channelSessionId);
    if (abre) return { adiarAte: abre };
  }

  const ctx = {
    mensagem: texto,
    agora: new Date(),
    fuso: conversa.timezone || "America/Sao_Paulo",
  };
  const resultado: ResultadoDoTurno = sessaoAnterior
    ? continuarFluxo(grafo, sessaoAnterior, ctx)
    : iniciarFluxo(grafo, inicio!, ctx);

  // Grava a sessão ANTES dos efeitos: se o envio falhar no meio, a próxima
  // mensagem não reinicia o fluxo do começo nem repete a pergunta já feita.
  sessaoId = await gravarSessao(pool, e, fluxoId, sessaoId, resultado.sessao);

  await executarEfeitos(pool, admin, e, fluxoId, resultado.efeitos, log);
  log.info("chatbot: mensagem conduzida pelo fluxo", {
    flow_id: fluxoId,
    session_id: sessaoId,
    status: resultado.sessao.status,
    passos: resultado.passos,
    efeitos: resultado.efeitos.map((x) => x.tipo),
  });
  return "atendeu";
}

async function encerrarSessao(
  pool: pg.Pool,
  org: string,
  id: string,
  status: string,
): Promise<void> {
  await pool.query(
    `update chatbot_sessions
        set status = $3, no_atual = null, ended_at = now(), updated_at = now()
      where organization_id = $1 and id = $2`,
    [org, id, status],
  );
}

async function gravarSessao(
  pool: pg.Pool,
  e: EntradaDoChatbot,
  fluxoId: string,
  sessaoId: string | null,
  s: SessaoDoChatbot,
): Promise<string> {
  const terminal = TERMINAIS.has(s.status);
  const { rows } = await pool.query<{ id: string }>(
    `insert into chatbot_sessions
       (organization_id, flow_id, conversation_id, status, no_atual, tentativas, collected_data,
        started_at, updated_at, ended_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now(), case when $8 then now() end)
     on conflict (organization_id, conversation_id, flow_id) do update
       set status = excluded.status,
           no_atual = excluded.no_atual,
           tentativas = excluded.tentativas,
           collected_data = excluded.collected_data,
           started_at = case when $9::uuid is null then now() else chatbot_sessions.started_at end,
           updated_at = now(),
           ended_at = excluded.ended_at
     returning id`,
    [
      e.organizationId,
      fluxoId,
      e.conversationId,
      s.status,
      s.no_atual,
      s.tentativas,
      JSON.stringify(s.dados),
      terminal,
      sessaoId,
    ],
  );
  const gravada = rows[0];
  if (!gravada) throw new Error("chatbot_sessao_nao_gravada");
  return gravada.id;
}

async function executarEfeitos(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  efeitos: Efeito[],
  log: Log,
): Promise<void> {
  if (efeitos.length === 0) return;
  const { rows: b } = await pool.query(
    `select organization_id, contact_id, conversation_id, service_revision::float8 as service_revision,
            demanda_id, demanda_revision::float8 as demanda_revision
       from messages where organization_id = $1 and id = $2 and direction = 'inbound'`,
    [e.organizationId, e.inboundMessageId],
  );
  const boundary = parseServiceBoundary(b[0] ?? null);

  for (const efeito of efeitos) {
    try {
      switch (efeito.tipo) {
        case "enviar": {
          if (!e.channelSessionId || !boundary) {
            log.warn("chatbot: sem número ou atendimento para enviar — mensagem não saiu");
            break;
          }
          await espacarEnvio(e.channelSessionId);
          const enviada = (await sendMessageHandler(
            admin,
            {
              organization_id: e.organizationId,
              serviceBoundary: boundary,
              actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
              requestId: `chatbot:${fluxoId}:${e.inboundMessageId}`,
            },
            { conversation_id: e.conversationId, type: "text", body: efeito.texto } as Parameters<
              typeof sendMessageHandler
            >[2],
          )) as { status?: string } | null;
          if (enviada?.status === "failed")
            log.warn("chatbot: envio marcado como falho", { flow_id: fluxoId });
          break;
        }
        case "etiquetas": {
          const { rows } = await pool.query<{ tags: string[] | null }>(
            `select tags from contacts where organization_id = $1 and id = $2`,
            [e.organizationId, e.contactId],
          );
          const antes = rows[0]?.tags ?? [];
          const remover = new Set(efeito.remover.map((t) => t.toLowerCase()));
          const depois = [
            ...antes.filter((t) => !remover.has(t.toLowerCase())),
            ...efeito.adicionar.filter(
              (t) => !antes.some((a) => a.toLowerCase() === t.toLowerCase()),
            ),
          ];
          const novas = depois.filter((t) => !antes.includes(t));
          await pool.query(
            `update contacts set tags = $3, updated_at = now() where organization_id = $1 and id = $2`,
            [e.organizationId, e.contactId, depois],
          );
          if (novas.length > 0) {
            // Mesmo evento das automações: quem reage a etiqueta nova continua reagindo.
            await admin.rpc("emit_event", {
              p_event_type: "contact.tag_added",
              p_entity_kind: "contact",
              p_entity_id: e.contactId,
              p_payload: { added_tags: novas, tags: depois },
              p_metadata: { source: "chatbot", flow_id: fluxoId },
              p_organization_id: e.organizationId,
            });
          }
          break;
        }
        case "transferir_equipe": {
          // Fila humana: a IA fica calada nesta conversa e a Distribuição de
          // atendimento escolhe quem pega. Só o humano devolve ao robô.
          await pool.query(
            `update conversations
                set status = case when status = 'ai_handling' then 'pending' else status end,
                    bot_silenced_until = 'infinity',
                    last_handoff_at = now(),
                    last_handoff_reason = 'chatbot',
                    active_ai_agent_id = null,
                    active_intent = null,
                    active_agent_set_at = null
              where organization_id = $1 and id = $2`,
            [e.organizationId, e.conversationId],
          );
          break;
        }
        case "transferir_atendente": {
          if (!efeito.user_id) break;
          const { data: membro } = await admin
            .from("user_organizations")
            .select("role")
            .eq("organization_id", e.organizationId)
            .eq("user_id", efeito.user_id)
            .is("revoked_at", null)
            .maybeSingle();
          if (!membro || membro.role === "viewer") {
            log.warn("chatbot: atendente do passo não é mais da equipe — transferência ignorada", {
              flow_id: fluxoId,
            });
            break;
          }
          const { error } = await admin.rpc("fn_conversation_assign", {
            p_organization_id: e.organizationId,
            p_conversation_id: e.conversationId,
            p_to_user_id: efeito.user_id,
            p_reason: "transfer",
            p_enforce_expected: false,
          });
          if (error)
            log.warn("chatbot: transferência para atendente falhou", {
              erro: error.message.slice(0, 120),
            });
          break;
        }
        case "finalizar": {
          const { rows } = await pool.query<{ service_revision: number }>(
            `select service_revision::float8 as service_revision from conversations where organization_id = $1 and id = $2`,
            [e.organizationId, e.conversationId],
          );
          const { error } = await admin.rpc("fn_service_status", {
            p_org: e.organizationId,
            p_conversation: e.conversationId,
            p_status: "closed",
            p_expected: rows[0]?.service_revision,
          });
          if (error)
            log.warn("chatbot: finalizar conversa falhou", { erro: error.message.slice(0, 120) });
          break;
        }
      }
    } catch (err) {
      // Um efeito que falha não impede os seguintes (a mensagem de despedida
      // ainda sai mesmo que a etiqueta não tenha sido gravada).
      log.warn("chatbot: efeito falhou", { efeito: efeito.tipo, erro: String(err).slice(0, 160) });
    }
  }
}
