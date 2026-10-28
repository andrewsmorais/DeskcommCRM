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
import { parseServiceBoundary, type ServiceBoundary } from "@/lib/atendimento/fronteira";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { patchContactHandler } from "@/app/api/v1/contacts/_handler";
import { audit } from "@/lib/audit";
import { normalizarTag } from "@/lib/contacts/tag-normalizada";
import { contactPatchSchema, type ContactPatch } from "@/lib/schemas/contacts";
import { grafoSchema, type Grafo } from "./passos";
import type { ContatoDoTurno } from "./regras";
import { randomUUID } from "node:crypto";
import { insertInboxItem } from "@/lib/agent-engine/db/repository";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { horariosLivresDaOrg } from "@/lib/agenda/consulta";
import { rotuloLocal } from "@/lib/tempo/agora";
import { marcarAgendamentoHandler } from "@/app/api/v1/agenda/agendamentos/_handler";
import { levarContatoAoFunil } from "@/lib/leads/levar-ao-funil";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { ApiError } from "@/lib/api/types";
import {
  continuarAposMarcar,
  continuarAposWebhook,
  continuarComHorarios,
  continuarFluxo,
  iniciarFluxo,
  inicioParaAcionar,
  inicioManual,
  inicioPorAutomacao,
  pontoDePartida,
  proximaMensagemDeEspera,
  respondeMensagens,
  respostasVisiveis,
  retomarFluxo,
  seguirAoResponder,
  type ContextoDoTurno,
  type Efeito,
  type FatosDaConversa,
  type OfertaDeHorario,
  type Pendente,
  type RespostaDoWebhook,
  type ResultadoDaMarcacao,
  type ResultadoDoTurno,
  type SessaoDoChatbot,
} from "./motor";
import { midiaDoChatbotDaOrg } from "./midia";
import { escolherOfertas } from "./ofertas";
import { quemPodeAssumirAgora } from "@/lib/escalacao/disponibilidade";
import { createLgpdRequest } from "@/lib/lgpd/repository";
import { lerConfig } from "./passos";
import { decifrarSegredosDoPasso } from "./segredos";
import { chamarWebhookDoChatbot } from "./webhook";

/** Teto de WebHooks numa mensagem só: um desenho em círculo não vira metralhadora. */
export const WEBHOOKS_POR_TURNO = 3;

/** Teto de "Acionar outro fluxo" numa mensagem só: dois fluxos que se chamam não giram para sempre. */
export const SALTOS_POR_TURNO = 3;

/** Teto de idas ao executor (WebHook, outro fluxo, horários, marcação) numa mensagem só. */
export const PENDENTES_POR_TURNO = 8;

/**
 * Marca interna da sessão começada por um ATENDENTE ("Iniciar manualmente"): a
 * conversa é dele, e mesmo assim o chatbot responde até o fluxo terminar.
 */
export const CHAVE_MANUAL = "_manual";

/** Quem a mensagem de espera considera "a equipe respondeu": pessoa, pelo CRM ou pelo celular. */
const ENVIO_DE_PESSOA = ["user", "crm", "external_device"];

/** Depois de terminar, o fluxo só recomeça na mesma conversa passado este tempo. */
export const HORAS_PARA_RECOMECAR = 6;

export type DesfechoDoChatbot = "atendeu" | "nao_atende" | { adiarAte: string };

export type EntradaDoChatbot = {
  organizationId: string;
  conversationId: string;
  contactId: string;
  channelSessionId: string | null;
  /** A mensagem do contato que acordou o fluxo; null quando foi uma automação. */
  inboundMessageId: string | null;
  /**
   * Fronteira do atendimento já resolvida — a da automação que iniciou o fluxo
   * (`serviceForAutomation`). Sem ela, sai da mensagem que chegou.
   */
  boundary?: ServiceBoundary | null;
  /** Fluxo iniciado pela empresa, não pelo contato: o envio passa pelas guardas de contato proativo. */
  proativo?: boolean;
  /** Para o requestId quando não há mensagem (id do pedido de início). */
  referencia?: string;
};

type Log = {
  info: (m: string, f?: Record<string, unknown>) => void;
  warn: (m: string, f?: Record<string, unknown>) => void;
};

type SessaoGravada = {
  id: string;
  flow_id: string;
  status: string;
  no_atual: string | null;
  tentativas: number;
  collected_data: Record<string, unknown> | null;
  grafo: unknown;
  is_active: boolean;
};

const TERMINAIS = new Set(["completed", "transferred"]);

/** O contato como o motor o enxerga em "Definir condição". */
function contatoDoTurno(c: {
  tags: string[] | null;
  nome: string | null;
  email: string | null;
  aniversario: string | null;
  custom_fields: Record<string, unknown> | null;
}): ContatoDoTurno {
  const personalizados: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.custom_fields ?? {}))
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      personalizados[k] = String(v);
  return {
    tags: c.tags ?? [],
    nome: c.nome,
    email: c.email,
    aniversario: c.aniversario,
    personalizados,
  };
}

function dadosDeTexto(v: Record<string, unknown> | null): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [k, val] of Object.entries(v ?? {})) if (typeof val === "string") saida[k] = val;
  return saida;
}

export async function atenderPeloChatbot(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot & { inboundMessageId: string },
  log: Log,
): Promise<DesfechoDoChatbot> {
  let sessaoEsperando: SessaoGravada | null;
  try {
    const { rows } = await pool.query<SessaoGravada>(
      `select s.id, s.flow_id, s.status, s.no_atual, s.tentativas, s.collected_data, f.grafo, f.is_active
         from chatbot_sessions s
         join chatbot_flows f on f.id = s.flow_id and f.organization_id = s.organization_id
        where s.organization_id = $1 and s.conversation_id = $2
          and s.status in ('waiting_input', 'waiting_timer')
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
    tags: string[] | null;
    nome: string | null;
    email: string | null;
    aniversario: string | null;
    custom_fields: Record<string, unknown> | null;
  }>(
    `select c.assignee_kind, ct.is_blocked, o.timezone,
            ct.tags, coalesce(ct.name, ct.display_name) as nome, ct.email,
            ct.birthdate::text as aniversario, ct.custom_fields
       from conversations c
       join contacts ct on ct.id = c.contact_id and ct.organization_id = c.organization_id
       join organizations o on o.id = c.organization_id
      where c.organization_id = $1 and c.id = $2 and c.is_group = false`,
    [e.organizationId, e.conversationId],
  );
  const conversa = estado[0];
  const manual = Boolean(
    sessaoEsperando && dadosDeTexto(sessaoEsperando.collected_data)[CHAVE_MANUAL],
  );
  if (!conversa || (conversa.assignee_kind === "user" && !manual) || conversa.is_blocked === true) {
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
      status: sessaoEsperando.status === "waiting_timer" ? "waiting_timer" : "waiting_input",
      tentativas: sessaoEsperando.tentativas ?? 0,
      dados: dadosDeTexto(sessaoEsperando.collected_data),
    };
    // Parado no relógio e o passo diz "continuar esperando": a mensagem fica
    // para a equipe ver na conversa, e nem o chatbot nem a IA respondem agora.
    if (
      sessaoAnterior.status === "waiting_timer" &&
      !seguirAoResponder(grafo, sessaoAnterior.no_atual)
    ) {
      log.info("chatbot: mensagem durante a espera — o fluxo segue esperando o relógio", {
        flow_id: fluxoId,
        session_id: sessaoId,
      });
      return "atendeu";
    }
  } else {
    // Cada número tem o seu chatbot de entrada (lib/chatbot/plano.ts): o
    // escolhido é o fluxo ligado cujo "Iniciar por um canal" aceita ESTE
    // número (e a palavra-chave, se houver). Antes era o primeiro fluxo da
    // organização, e a mensagem do segundo número ficava sem chatbot.
    // Os de "Iniciar por automação" ou "manualmente" esperam quem os chama.
    const { rows: fluxos } = await pool.query<{ id: string; grafo: unknown }>(
      `select id, grafo from chatbot_flows
        where organization_id = $1 and is_active
        order by updated_at desc
        limit 50`,
      [e.organizationId],
    );
    let escolhido: { id: string; grafo: Grafo; inicio: string } | null = null;
    for (const f of fluxos) {
      const g = grafoSchema.safeParse(f.grafo);
      if (!g.success || !respondeMensagens(g.data)) continue;
      const inicioDoFluxo = pontoDePartida(g.data, {
        channelSessionId: e.channelSessionId,
        mensagem: texto,
      });
      if (inicioDoFluxo) {
        escolhido = { id: f.id, grafo: g.data, inicio: inicioDoFluxo };
        break;
      }
    }
    if (!escolhido) return "nao_atende";
    fluxoId = escolhido.id;
    grafo = escolhido.grafo;

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

  const ctx: ContextoDoTurno = {
    mensagem: texto,
    agora: new Date(),
    fuso: conversa.timezone || "America/Sao_Paulo",
    contato: contatoDoTurno(conversa),
    conversa: await lerFatosDaConversa(pool, e, fluxoId, grafo),
  };
  const resultado: ResultadoDoTurno = !sessaoAnterior
    ? iniciarFluxo(grafo, inicio!, ctx)
    : sessaoAnterior.status === "waiting_timer"
      ? retomarFluxo(grafo, sessaoAnterior, ctx)
      : continuarFluxo(grafo, sessaoAnterior, ctx);

  await conduzir(pool, admin, e, fluxoId, grafo, sessaoId, resultado, ctx, log);
  return "atendeu";
}

/**
 * Grava cada trecho do turno e, quando o motor para pedindo algo de fora
 * (WebHook, outro fluxo, horários livres, marcação), faz e devolve ao motor —
 * até o fluxo parar de verdade (pergunta, relógio, fim) ou um dos tetos.
 */
async function conduzir(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoInicial: string,
  grafoInicial: Grafo,
  sessaoId: string | null,
  inicial: ResultadoDoTurno,
  ctxInicial: ContextoDoTurno,
  log: Log,
): Promise<void> {
  let fluxoId = fluxoInicial;
  let grafo = grafoInicial;
  let ctx = ctxInicial;
  let resultado = inicial;
  let id = sessaoId;
  let webhooks = 0;
  let saltos = 0;
  for (let pendentes = 0; ; pendentes++) {
    const gravada = await concluirTurno(pool, admin, e, fluxoId, id, resultado, log);
    id = gravada.id;
    const pendente: Pendente | undefined = resultado.pendente;
    if (!pendente) return;
    if (pendentes >= PENDENTES_POR_TURNO) {
      log.warn("chatbot: teto de passos externos por mensagem — fluxo encerrado", {
        flow_id: fluxoId,
      });
      await encerrarSessao(pool, e.organizationId, gravada.id, "completed");
      return;
    }
    switch (pendente.tipo) {
      case "webhook": {
        if (++webhooks > WEBHOOKS_POR_TURNO) {
          log.warn("chatbot: teto de WebHooks por mensagem — fluxo encerrado", {
            flow_id: fluxoId,
          });
          await encerrarSessao(pool, e.organizationId, gravada.id, "completed");
          return;
        }
        const resposta = await fazerWebhook(pool, admin, e, fluxoId, grafo, resultado, ctx, log);
        resultado = continuarAposWebhook(grafo, resultado.sessao, resposta, ctx);
        break;
      }
      case "fluxo": {
        if (++saltos > SALTOS_POR_TURNO) {
          log.warn("chatbot: teto de 'Acionar outro fluxo' por mensagem — fluxo encerrado", {
            flow_id: fluxoId,
          });
          return;
        }
        const alvo = await fluxoParaAcionar(pool, e.organizationId, pendente.flow_id);
        if (!alvo) {
          log.info("chatbot: 'Acionar outro fluxo' apontou fluxo desligado ou sem início", {
            flow_id: fluxoId,
            alvo: pendente.flow_id,
          });
          // A sessão deste fluxo já terminou; a equipe fica sabendo por quê.
          await concluirTurno(
            pool,
            admin,
            e,
            fluxoId,
            id,
            {
              sessao: resultado.sessao,
              efeitos: [
                {
                  tipo: "nota",
                  texto:
                    "O chatbot tentou abrir outro fluxo, mas ele está desligado, não existe mais ou não tem passo de início.",
                },
              ],
              passos: 0,
            },
            log,
          );
          return;
        }
        // O fluxo anterior pode ter mudado etiqueta ou campo: o novo enxerga.
        ctx = {
          ...ctx,
          contato: (await lerContatoDoTurno(pool, e)) ?? ctx.contato,
          conversa: await lerFatosDaConversa(pool, e, alvo.id, alvo.grafo),
        };
        log.info("chatbot: fluxo acionou outro fluxo", { de: fluxoId, para: alvo.id });
        resultado = iniciarFluxo(alvo.grafo, alvo.inicio, ctx, {
          ...respostasVisiveis(resultado.sessao.dados),
          // Fluxo começado por um atendente segue sendo dele no fluxo chamado.
          ...(resultado.sessao.dados[CHAVE_MANUAL] ? { [CHAVE_MANUAL]: "1" } : {}),
        });
        fluxoId = alvo.id;
        grafo = alvo.grafo;
        // Rodada nova no outro fluxo (a avaliação de cada rodada fica separada).
        id = null;
        break;
      }
      case "horarios": {
        const ofertas = await buscarHorarios(admin, e, grafo, pendente.no, log);
        resultado = continuarComHorarios(grafo, resultado.sessao, ofertas, ctx);
        break;
      }
      case "marcar": {
        const r = await marcarHorario(admin, e, fluxoId, grafo, pendente, gravada.id, log);
        resultado = continuarAposMarcar(grafo, resultado.sessao, r, ctx);
        break;
      }
    }
  }
}

/** O fluxo que "Acionar outro fluxo" começa — ligado, desta organização, com passo de início. */
async function fluxoParaAcionar(
  pool: pg.Pool,
  org: string,
  flowId: string,
): Promise<{ id: string; grafo: Grafo; inicio: string } | null> {
  const { rows } = await pool.query<{ id: string; grafo: unknown }>(
    `select id, grafo from chatbot_flows where organization_id = $1 and id = $2 and is_active`,
    [org, flowId],
  );
  const g = grafoSchema.safeParse(rows[0]?.grafo);
  if (!rows[0] || !g.success) return null;
  const inicio = inicioParaAcionar(g.data);
  return inicio ? { id: rows[0].id, grafo: g.data, inicio } : null;
}

async function lerContatoDoTurno(
  pool: pg.Pool,
  e: EntradaDoChatbot,
): Promise<ContatoDoTurno | null> {
  const { rows } = await pool.query<{
    tags: string[] | null;
    nome: string | null;
    email: string | null;
    aniversario: string | null;
    custom_fields: Record<string, unknown> | null;
  }>(
    `select tags, coalesce(name, display_name) as nome, email, birthdate::text as aniversario, custom_fields
       from contacts where organization_id = $1 and id = $2`,
    [e.organizationId, e.contactId],
  );
  return rows[0] ? contatoDoTurno(rows[0]) : null;
}

/** Os passos que leem os fatos da conversa: sem nenhum no desenho, nada é consultado. */
const PASSOS_QUE_LEEM_A_CONVERSA = new Set([
  "contato_ativo",
  "primeira_conversa",
  "canal_da_conversa",
  "atendente_da_conversa",
  "presenca_do_atendente",
  "bot_paralelo",
  "status_da_conversa",
]);

/**
 * Os fatos que "O contato está ativo?", "Primeira conversa?", "Canal",
 * "Atendente", "Presença", "Bot paralelo" e "Status da conversa" leem — uma
 * consulta por turno, e só quando o desenho tem um desses passos.
 */
async function lerFatosDaConversa(
  pool: pg.Pool,
  e: EntradaDoChatbot,
  fluxoId: string,
  grafo: Grafo,
): Promise<FatosDaConversa | undefined> {
  if (!grafo.nodes.some((n) => PASSOS_QUE_LEEM_A_CONVERSA.has(n.type))) return undefined;
  try {
    const { rows } = await pool.query<{
      channel_session_id: string | null;
      assigned_to_user_id: string | null;
      last_inbound_at: string | null;
      aguardando: boolean;
      primeira: boolean;
      ia_ativa: boolean;
      outro_chatbot: boolean;
    }>(
      `select c.channel_session_id, c.assigned_to_user_id, c.last_inbound_at::text as last_inbound_at,
              (c.last_inbound_at is not null
                 and (c.last_outbound_at is null or c.last_inbound_at > c.last_outbound_at)) as aguardando,
              not exists (
                select 1 from messages m
                 where m.organization_id = c.organization_id and m.contact_id = c.contact_id
                   and m.direction = 'inbound'
                   and m.created_at < coalesce(c.service_started_at, c.created_at)
              ) as primeira,
              (c.active_ai_agent_id is not null
                 and (c.bot_silenced_until is null or c.bot_silenced_until < now())) as ia_ativa,
              exists (
                select 1 from chatbot_sessions s
                 where s.organization_id = c.organization_id and s.conversation_id = c.id
                   and s.flow_id <> $3 and s.status in ('waiting_input', 'waiting_timer')
              ) as outro_chatbot
         from conversations c
        where c.organization_id = $1 and c.id = $2`,
      [e.organizationId, e.conversationId, fluxoId],
    );
    const c = rows[0];
    if (!c) return undefined;
    const equipe = grafo.nodes.some((n) => n.type === "presenca_do_atendente")
      ? (await quemPodeAssumirAgora(pool, e.organizationId, new Date())).disponiveis > 0
      : false;
    return {
      canal: c.channel_session_id,
      atendente: c.assigned_to_user_id,
      ultima_entrada_em: c.last_inbound_at,
      aguardando_resposta: c.aguardando,
      primeira_conversa: c.primeira,
      equipe_disponivel: equipe,
      outro_bot: c.ia_ativa || c.outro_chatbot,
    };
  } catch {
    // Sem os fatos, as condições seguem por "não" — o fluxo não para por isso.
    return undefined;
  }
}

/** Os horários livres do passo "Agendar horário" — a mesma consulta da Agenda e da IA. */
async function buscarHorarios(
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  grafo: Grafo,
  noId: string,
  log: Log,
): Promise<OfertaDeHorario[]> {
  const no = grafo.nodes.find((n) => n.id === noId);
  if (!no) return [];
  const c = lerConfig("agendar_horario", no.data);
  if (!c.event_type_id) return [];
  const agora = new Date();
  try {
    const consulta = await horariosLivresDaOrg(admin, e.organizationId, {
      eventTypeId: c.event_type_id,
      ownerUserId: c.owner_user_id,
      de: agora,
      ate: new Date(agora.getTime() + c.dias_a_frente * 86_400_000),
      agora,
    });
    if (!consulta.ok) {
      log.info("chatbot: agenda recusou a consulta de horários", { motivo: consulta.codigo });
      return [];
    }
    return escolherOfertas(consulta.slots, consulta.fusoDaRegra, c.quantidade).map((s) => ({
      inicio: s.inicio.toISOString(),
      quando: rotuloLocal(s.inicio, consulta.fusoDaRegra),
    }));
  } catch (err) {
    log.warn("chatbot: consulta de horários falhou", { erro: String(err).slice(0, 160) });
    return [];
  }
}

/**
 * Marca o horário escolhido pelo MESMO handler da tela e da IA: confere de
 * novo que está livre, reserva, cria o vínculo com o negócio e audita. A chave
 * de idempotência é da sessão + horário: o replay de um evento não marca duas
 * vezes.
 */
async function marcarHorario(
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  grafo: Grafo,
  pendente: Extract<Pendente, { tipo: "marcar" }>,
  sessaoId: string,
  log: Log,
): Promise<ResultadoDaMarcacao> {
  const no = grafo.nodes.find((n) => n.id === pendente.no);
  const c = no ? lerConfig("agendar_horario", no.data) : null;
  if (!c?.event_type_id) return { ok: false, ocupado: false };
  try {
    const r = await marcarAgendamentoHandler(
      admin,
      {
        organization_id: e.organizationId,
        actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
        requestId: `chatbot:${fluxoId}:${sessaoId}`,
        idempotencyKey: `chatbot:${sessaoId}:${pendente.inicio}`,
      },
      {
        event_type_id: c.event_type_id,
        starts_at: pendente.inicio,
        contact_id: e.contactId,
        conversation_id: e.conversationId,
        ...(c.owner_user_id ? { owner_user_id: c.owner_user_id } : {}),
      },
    );
    log.info("chatbot: horário marcado", { flow_id: fluxoId, status: String(r.status ?? "") });
    return { ok: true, aguardaConfirmacao: r.status === "pending" };
  } catch (err) {
    if (err instanceof ApiError) {
      log.info("chatbot: a agenda recusou a marcação", { flow_id: fluxoId, codigo: err.code });
      return { ok: false, ocupado: err.code === "agenda_horario_indisponivel" };
    }
    log.warn("chatbot: marcação falhou", { flow_id: fluxoId, erro: String(err).slice(0, 160) });
    return { ok: false, ocupado: false };
  }
}

async function fazerWebhook(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  grafo: Grafo,
  resultado: ResultadoDoTurno,
  ctx: ContextoDoTurno,
  log: Log,
): Promise<RespostaDoWebhook> {
  const no = grafo.nodes.find((n) => n.id === resultado.pendente?.no);
  if (!no) return { ok: false, status: null, corpo: null };
  const c = lerConfig("webhook", no.data);
  const segredos = await decifrarSegredosDoPasso(admin, c);
  // Segredo gravado que não abre: não chama sem ele (sairia sem assinatura ou
  // sem autorização) — segue por "Falhou".
  if ((c.segredo_enc && !segredos.segredo) || (c.autorizacao_enc && !segredos.autorizacao)) {
    log.warn("chatbot: segredo do WebHook não pôde ser decifrado — chamada não feita", {
      flow_id: fluxoId,
    });
    return { ok: false, status: null, corpo: null };
  }
  const { rows } = await pool.query<{
    nome: string | null;
    telefone: string | null;
    email: string | null;
  }>(
    `select coalesce(name, display_name) as nome, phone_number as telefone, email
       from contacts where organization_id = $1 and id = $2`,
    [e.organizationId, e.contactId],
  );
  const r = await chamarWebhookDoChatbot(
    c,
    {
      fluxoId,
      passoId: no.id,
      conversationId: e.conversationId,
      contato: { id: e.contactId, ...(rows[0] ?? { nome: null, telefone: null, email: null }) },
      mensagem: ctx.mensagem,
      respostas: respostasVisiveis(resultado.sessao.dados),
    },
    segredos,
  );
  let destino = "";
  try {
    destino = new URL(c.url.replace(/\{\{[^}]*\}\}/g, "x")).hostname;
  } catch {
    destino = "url_invalida";
  }
  // Só o host vai para o log: a URL pode levar a resposta do contato.
  log.info("chatbot: WebHook chamado", {
    flow_id: fluxoId,
    destino,
    status: r.status,
    ok: r.ok,
    erro: r.erro ?? null,
  });
  return r;
}

/**
 * Grava a sessão, executa os efeitos e, se o fluxo parou no relógio, agenda a
 * retomada. A sessão vai ANTES dos efeitos: se o envio falhar no meio, a
 * próxima mensagem não reinicia o fluxo do começo nem repete a pergunta feita.
 */
async function concluirTurno(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  sessaoAnteriorId: string | null,
  resultado: ResultadoDoTurno,
  log: Log,
): Promise<SessaoDoTurno> {
  const token = temRelogio(resultado.sessao) ? randomUUID() : null;
  const gravada = await gravarSessao(pool, e, fluxoId, sessaoAnteriorId, resultado.sessao, token);

  await executarEfeitos(pool, admin, e, fluxoId, gravada, resultado.efeitos, log);

  if (token && resultado.sessao.retomar_em)
    await agendarRetomada(pool, e, fluxoId, gravada.id, token, resultado.sessao.retomar_em);
  log.info("chatbot: turno conduzido pelo fluxo", {
    flow_id: fluxoId,
    session_id: gravada.id,
    status: resultado.sessao.status,
    retomar_em: resultado.sessao.retomar_em ?? null,
    passos: resultado.passos,
    efeitos: resultado.efeitos.map((x) => x.tipo),
    pendente: resultado.pendente?.tipo ?? null,
  });
  return gravada;
}

/**
 * O relógio vira um comando no barramento, com hora marcada: o drain do worker
 * só o pega a partir de `next_attempt_at`. Sem cron novo.
 */
async function agendarRetomada(
  pool: pg.Pool,
  e: EntradaDoChatbot,
  fluxoId: string,
  sessaoId: string,
  token: string,
  quando: string,
): Promise<void> {
  await pool.query(
    `insert into event_log
       (organization_id, event_type, entity_kind, entity_id, payload, metadata, next_attempt_at)
     values ($1, 'chatbot.retomada_requested', 'chatbot_session', $2, $3::jsonb, $4::jsonb, $5)`,
    [
      e.organizationId,
      sessaoId,
      JSON.stringify({
        session_id: sessaoId,
        token,
        conversation_id: e.conversationId,
        contact_id: e.contactId,
        channel_session_id: e.channelSessionId,
        inbound_message_id: e.inboundMessageId,
        boundary: e.inboundMessageId ? null : (e.boundary ?? null),
        proativo: Boolean(e.proativo),
      } satisfies PedidoDeRetomada),
      JSON.stringify({ source: "chatbot", flow_id: fluxoId }),
      quando,
    ],
  );
}

/** A sessão para no relógio: espera do fluxo, ou mensagem de espera de uma transferência. */
function temRelogio(s: SessaoDoChatbot): boolean {
  return Boolean(s.retomar_em) && (s.status === "waiting_timer" || s.status === "transferred");
}

/** O que viaja no `chatbot.inicio_requested` (ação de automação "Iniciar chatbot"). */
export type PedidoDeInicio = {
  flow_id: string;
  contact_id: string;
  conversation_id: string;
  channel_session_id: string;
  /** A fronteira do atendimento que a automação resolveu (`serviceForAutomation`). */
  boundary: ServiceBoundary;
  /** Variáveis prontas para o fluxo: campos do negócio, produto, link do checkout. */
  variaveis: Record<string, string>;
  /** A regra que mandou — vai no log e no requestId. */
  regra_id: string | null;
  /** Começado por um atendente na Inbox ("Iniciar manualmente"), não por uma regra. */
  manual?: boolean;
  /** Quem começou (manual). */
  iniciado_por?: string | null;
};

export type DesfechoDoInicio = "iniciou" | "descartado" | { adiarAte: string };

/**
 * Uma automação mandou começar um fluxo de "Iniciar por automação" para um
 * contato. Chamado pelo drain do worker para cada `chatbot.inicio_requested`.
 *
 * Descarta (sem erro) quando não cabe: fluxo desligado ou sem esse início,
 * atendente humano com a conversa, contato bloqueado, organização sem plano.
 * Se o contato estava parado em outro fluxo (esperando resposta ou relógio),
 * aquele fluxo termina e este começa — a automação é o fato mais novo (ex.: o
 * carrinho abandonado vira compra aprovada).
 */
export async function iniciarChatbotPorAutomacao(
  pool: pg.Pool,
  admin: SupabaseClient,
  pedido: PedidoDeInicio,
  organizationId: string,
  log: Log,
): Promise<DesfechoDoInicio> {
  const { rows: fluxos } = await pool.query<{ id: string; grafo: unknown; is_active: boolean }>(
    `select id, grafo, is_active from chatbot_flows where organization_id = $1 and id = $2`,
    [organizationId, pedido.flow_id],
  );
  const fluxo = fluxos[0];
  const g = grafoSchema.safeParse(fluxo?.grafo);
  const inicio = g.success
    ? pedido.manual
      ? inicioManual(g.data)
      : inicioPorAutomacao(g.data)
    : null;
  if (!fluxo?.is_active || !g.success || !inicio) {
    log.info("chatbot: automação pediu fluxo desligado ou sem 'Iniciar por automação'", {
      flow_id: pedido.flow_id,
    });
    return "descartado";
  }

  const { rows: estado } = await pool.query<{
    assignee_kind: string | null;
    is_blocked: boolean | null;
    timezone: string | null;
    tags: string[] | null;
    nome: string | null;
    email: string | null;
    aniversario: string | null;
    custom_fields: Record<string, unknown> | null;
  }>(
    `select c.assignee_kind, ct.is_blocked, o.timezone,
            ct.tags, coalesce(ct.name, ct.display_name) as nome, ct.email,
            ct.birthdate::text as aniversario, ct.custom_fields
       from conversations c
       join contacts ct on ct.id = c.contact_id and ct.organization_id = c.organization_id
       join organizations o on o.id = c.organization_id
      where c.organization_id = $1 and c.id = $2 and c.contact_id = $3 and c.is_group = false`,
    [organizationId, pedido.conversation_id, pedido.contact_id],
  );
  const conversa = estado[0];
  // O atendente que começou o fluxo está com a conversa — e quis o chatbot nela.
  if (
    !conversa ||
    (conversa.assignee_kind === "user" && !pedido.manual) ||
    conversa.is_blocked === true
  )
    return "descartado";

  const acesso = decidirAcessoPeloPlano(await getOrganizationBilling(organizationId));
  if (!acesso.liberado) return "descartado";

  const abre = await adiarAteAJanelaAbrir(admin, organizationId, pedido.channel_session_id);
  if (abre) return { adiarAte: abre };

  // O fato mais novo vence: quem estava parado em outro fluxo sai dele.
  await pool.query(
    `update chatbot_sessions
        set status = 'completed', no_atual = null, ended_at = now(), updated_at = now(),
            retomar_em = null, retomada_token = null
      where organization_id = $1 and conversation_id = $2
        and status in ('waiting_input', 'waiting_timer', 'running')`,
    [organizationId, pedido.conversation_id],
  );
  // Uma transferência com mensagem de espera para de mandar: o fluxo novo é quem fala agora.
  await pool.query(
    `update chatbot_sessions set retomar_em = null, retomada_token = null, updated_at = now()
      where organization_id = $1 and conversation_id = $2
        and status = 'transferred' and retomada_token is not null`,
    [organizationId, pedido.conversation_id],
  );

  const e: EntradaDoChatbot = {
    organizationId,
    conversationId: pedido.conversation_id,
    contactId: pedido.contact_id,
    channelSessionId: pedido.channel_session_id,
    inboundMessageId: null,
    boundary: pedido.boundary,
    proativo: true,
    referencia: pedido.manual
      ? `manual:${pedido.iniciado_por ?? "?"}`
      : `regra:${pedido.regra_id ?? "?"}`,
  };
  const ctx: ContextoDoTurno = {
    mensagem: null,
    agora: new Date(),
    fuso: conversa.timezone || "America/Sao_Paulo",
    contato: contatoDoTurno(conversa),
    conversa: await lerFatosDaConversa(pool, e, fluxo.id, g.data),
  };
  const resultado = iniciarFluxo(g.data, inicio, ctx, {
    ...pedido.variaveis,
    ...(pedido.manual ? { [CHAVE_MANUAL]: "1" } : {}),
  });
  // `null` = rodada nova: a gravação reinicia `started_at` mesmo que o fluxo
  // já tenha rodado nesta conversa (a avaliação de cada rodada fica separada).
  await conduzir(pool, admin, e, fluxo.id, g.data, null, resultado, ctx, log);
  log.info(
    pedido.manual
      ? "chatbot: fluxo iniciado por atendente"
      : "chatbot: fluxo iniciado por automação",
    {
      flow_id: fluxo.id,
      regra_id: pedido.regra_id,
    },
  );
  return "iniciou";
}

/** O que viaja no `chatbot.retomada_requested`. */
export type PedidoDeRetomada = {
  session_id: string;
  token: string;
  conversation_id: string;
  contact_id: string;
  channel_session_id: string | null;
  /** A mensagem que levou o fluxo à espera — dá a fronteira do atendimento ao envio. */
  inbound_message_id: string | null;
  /** Fluxo iniciado por automação (sem mensagem): a fronteira dela. */
  boundary?: ServiceBoundary | null;
  proativo?: boolean;
};

export type DesfechoDaRetomada = "retomou" | "descartado" | { adiarAte: string };

/**
 * O relógio de "Aguardar intervalo" / "Aguardar até" venceu: acorda o fluxo.
 * Chamado pelo drain do worker para cada `chatbot.retomada_requested`.
 *
 * Descarta (sem erro) quando a espera já não é esta: o contato respondeu e o
 * fluxo seguiu, o fluxo foi desligado, um atendente assumiu. O token gravado na
 * sessão é o que amarra o evento à espera que o criou.
 */
export async function retomarChatbotPeloRelogio(
  pool: pg.Pool,
  admin: SupabaseClient,
  pedido: PedidoDeRetomada,
  organizationId: string,
  log: Log,
): Promise<DesfechoDaRetomada> {
  const { rows } = await pool.query<
    SessaoGravada & {
      retomar_em: string | null;
      timezone: string | null;
      ended_at: string | null;
      started_at: string;
    }
  >(
    `select s.id, s.flow_id, s.status, s.no_atual, s.tentativas, s.collected_data, s.retomar_em,
            s.ended_at::text as ended_at, s.started_at::text as started_at,
            f.grafo, f.is_active, o.timezone
       from chatbot_sessions s
       join chatbot_flows f on f.id = s.flow_id and f.organization_id = s.organization_id
       join organizations o on o.id = s.organization_id
      where s.organization_id = $1 and s.id = $2
        and s.status in ('waiting_timer', 'transferred') and s.retomada_token = $3::uuid`,
    [organizationId, pedido.session_id, pedido.token],
  );
  const sessao = rows[0];
  if (!sessao) return "descartado";

  if (sessao.retomar_em && new Date(sessao.retomar_em).getTime() > Date.now() + 1_000)
    return { adiarAte: sessao.retomar_em };

  if (sessao.status === "transferred")
    return mandarMensagemDeEspera(pool, admin, pedido, organizationId, sessao, log);

  const g = grafoSchema.safeParse(sessao.grafo);
  if (!sessao.is_active || !g.success) {
    await encerrarSessao(pool, organizationId, sessao.id, "completed");
    return "descartado";
  }

  const { rows: estado } = await pool.query<{
    assignee_kind: string | null;
    is_blocked: boolean | null;
    tags: string[] | null;
    nome: string | null;
    email: string | null;
    aniversario: string | null;
    custom_fields: Record<string, unknown> | null;
  }>(
    `select c.assignee_kind, ct.is_blocked,
            ct.tags, coalesce(ct.name, ct.display_name) as nome, ct.email,
            ct.birthdate::text as aniversario, ct.custom_fields
       from conversations c
       join contacts ct on ct.id = c.contact_id and ct.organization_id = c.organization_id
      where c.organization_id = $1 and c.id = $2 and c.is_group = false`,
    [organizationId, pedido.conversation_id],
  );
  const conversa = estado[0];
  const manual = Boolean(dadosDeTexto(sessao.collected_data)[CHAVE_MANUAL]);
  if (!conversa || (conversa.assignee_kind === "user" && !manual) || conversa.is_blocked === true) {
    await encerrarSessao(pool, organizationId, sessao.id, "completed");
    return "descartado";
  }

  const acesso = decidirAcessoPeloPlano(await getOrganizationBilling(organizationId));
  if (!acesso.liberado) {
    log.info("chatbot: retomada sem assinatura ativa — fluxo encerrado", { motivo: acesso.motivo });
    await encerrarSessao(pool, organizationId, sessao.id, "completed");
    return "descartado";
  }

  if (pedido.channel_session_id) {
    const abre = await adiarAteAJanelaAbrir(admin, organizationId, pedido.channel_session_id);
    if (abre) return { adiarAte: abre };
  }

  const e: EntradaDoChatbot = {
    organizationId,
    conversationId: pedido.conversation_id,
    contactId: pedido.contact_id,
    channelSessionId: pedido.channel_session_id,
    inboundMessageId: pedido.inbound_message_id,
    boundary: pedido.boundary ?? null,
    proativo: pedido.proativo ?? false,
    referencia: pedido.session_id,
  };
  const ctxDaRetomada: ContextoDoTurno = {
    mensagem: null,
    agora: new Date(),
    fuso: sessao.timezone || "America/Sao_Paulo",
    contato: contatoDoTurno(conversa),
    conversa: await lerFatosDaConversa(pool, e, sessao.flow_id, g.data),
  };
  const resultado = retomarFluxo(
    g.data,
    {
      no_atual: sessao.no_atual,
      status: "waiting_timer",
      tentativas: sessao.tentativas ?? 0,
      dados: dadosDeTexto(sessao.collected_data),
    },
    ctxDaRetomada,
  );
  await conduzir(pool, admin, e, sessao.flow_id, g.data, sessao.id, resultado, ctxDaRetomada, log);
  return "retomou";
}

/**
 * "Fluxo de espera": a conversa foi transferida e o relógio da mensagem de
 * espera venceu. Só manda se ninguém da EQUIPE respondeu desde a transferência
 * (mensagem de pessoa — pelo CRM ou pelo celular; a do próprio chatbot não
 * conta) e se a conversa segue aberta. Senão, desarma em silêncio.
 */
async function mandarMensagemDeEspera(
  pool: pg.Pool,
  admin: SupabaseClient,
  pedido: PedidoDeRetomada,
  organizationId: string,
  sessao: SessaoGravada & { ended_at: string | null; started_at: string },
  log: Log,
): Promise<DesfechoDaRetomada> {
  const desarmar = async () => {
    await pool.query(
      `update chatbot_sessions set retomar_em = null, retomada_token = null, updated_at = now()
        where organization_id = $1 and id = $2`,
      [organizationId, sessao.id],
    );
    return "descartado" as const;
  };
  const g = grafoSchema.safeParse(sessao.grafo);
  if (!sessao.is_active || !g.success) return desarmar();

  const { rows: estado } = await pool.query<{
    status: string;
    is_blocked: boolean | null;
    respondeu: boolean;
  }>(
    `select c.status, ct.is_blocked,
            exists (
              select 1 from messages m
               where m.organization_id = c.organization_id and m.conversation_id = c.id
                 and m.direction = 'outbound' and m.sent_via = any($4::text[])
                 and m.created_at > coalesce($3::timestamptz, '-infinity'::timestamptz)
            ) as respondeu
       from conversations c
       join contacts ct on ct.id = c.contact_id and ct.organization_id = c.organization_id
      where c.organization_id = $1 and c.id = $2 and c.is_group = false`,
    [organizationId, pedido.conversation_id, sessao.ended_at, ENVIO_DE_PESSOA],
  );
  const conversa = estado[0];
  if (
    !conversa ||
    conversa.respondeu ||
    conversa.is_blocked === true ||
    ["closed", "resolved", "archived"].includes(conversa.status)
  ) {
    log.info("chatbot: mensagem de espera desarmada — a equipe respondeu ou a conversa fechou", {
      session_id: sessao.id,
    });
    return desarmar();
  }

  const acesso = decidirAcessoPeloPlano(await getOrganizationBilling(organizationId));
  if (!acesso.liberado) return desarmar();

  if (pedido.channel_session_id) {
    const abre = await adiarAteAJanelaAbrir(admin, organizationId, pedido.channel_session_id);
    if (abre) return { adiarAte: abre };
  }

  const proxima = proximaMensagemDeEspera(
    g.data,
    {
      no_atual: sessao.no_atual,
      status: "transferred",
      tentativas: sessao.tentativas ?? 0,
      dados: dadosDeTexto(sessao.collected_data),
    },
    new Date(),
  );
  if (!proxima) return desarmar();

  const e: EntradaDoChatbot = {
    organizationId,
    conversationId: pedido.conversation_id,
    contactId: pedido.contact_id,
    channelSessionId: pedido.channel_session_id,
    inboundMessageId: pedido.inbound_message_id,
    boundary: pedido.boundary ?? null,
    proativo: pedido.proativo ?? false,
    referencia: `${pedido.session_id}:espera:${proxima.sessao.tentativas}`,
  };
  const token = proxima.sessao.retomar_em ? randomUUID() : null;
  // A sessão anda ANTES do envio (mesma regra de `concluirTurno`): um replay
  // do evento não manda a mesma mensagem de espera duas vezes.
  await pool.query(
    `update chatbot_sessions
        set tentativas = $3, retomar_em = $4, retomada_token = $5, updated_at = now()
      where organization_id = $1 and id = $2`,
    [organizationId, sessao.id, proxima.sessao.tentativas, proxima.sessao.retomar_em, token],
  );
  await executarEfeitos(
    pool,
    admin,
    e,
    sessao.flow_id,
    { id: sessao.id, started_at: sessao.started_at },
    [{ tipo: "enviar", texto: proxima.texto }],
    log,
  );
  if (token && proxima.sessao.retomar_em)
    await agendarRetomada(pool, e, sessao.flow_id, sessao.id, token, proxima.sessao.retomar_em);
  log.info("chatbot: mensagem de espera enviada", {
    flow_id: sessao.flow_id,
    session_id: sessao.id,
    vez: proxima.sessao.tentativas,
  });
  return "retomou";
}

async function encerrarSessao(
  pool: pg.Pool,
  org: string,
  id: string,
  status: string,
): Promise<void> {
  await pool.query(
    `update chatbot_sessions
        set status = $3, no_atual = null, ended_at = now(), updated_at = now(),
            retomar_em = null, retomada_token = null
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
  token: string | null,
): Promise<SessaoDoTurno> {
  const terminal = TERMINAIS.has(s.status);
  const { rows } = await pool.query<SessaoDoTurno>(
    `insert into chatbot_sessions
       (organization_id, flow_id, conversation_id, status, no_atual, tentativas, collected_data,
        started_at, updated_at, ended_at, retomar_em, retomada_token)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now(), case when $8 then now() end, $10, $11)
     on conflict (organization_id, conversation_id, flow_id) do update
       set status = excluded.status,
           no_atual = excluded.no_atual,
           tentativas = excluded.tentativas,
           collected_data = excluded.collected_data,
           started_at = case when $9::uuid is null then now() else chatbot_sessions.started_at end,
           updated_at = now(),
           ended_at = excluded.ended_at,
           retomar_em = excluded.retomar_em,
           retomada_token = excluded.retomada_token
     returning id, started_at::text as started_at`,
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
      temRelogio(s) ? (s.retomar_em ?? null) : null,
      token,
    ],
  );
  const gravada = rows[0];
  if (!gravada) throw new Error("chatbot_sessao_nao_gravada");
  return gravada;
}

/** A sessão como gravada: o id e o início da rodada (a chave da avaliação). */
type SessaoDoTurno = { id: string; started_at: string };

async function executarEfeitos(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  sessao: SessaoDoTurno,
  efeitos: Efeito[],
  log: Log,
): Promise<void> {
  if (efeitos.length === 0) return;
  const requestId = `chatbot:${fluxoId}:${e.inboundMessageId ?? e.referencia ?? sessao.id}`;
  const notaInterna = async (texto: string) => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into conversation_notes (organization_id, conversation_id, body, created_by_name)
       values ($1, $2, $3, 'Chatbot')
       returning id`,
      [e.organizationId, e.conversationId, texto.slice(0, 2000)],
    );
    void audit({
      action: "conversation.note_added",
      actorUserId: null,
      organizationId: e.organizationId,
      resourceType: "conversation_note",
      resourceId: rows[0]?.id ?? null,
      requestId,
      bypassedRls: true,
      metadata: { conversation_id: e.conversationId, source: "chatbot", flow_id: fluxoId },
    });
  };
  const gravarAvaliacao = (campos: { nota?: number; escala?: string; comentou?: boolean }) =>
    pool.query(
      `insert into chatbot_avaliacoes
         (organization_id, flow_id, session_id, rodada_em, conversation_id, nota, escala, comentou)
       values ($1, $2, $3, $4::timestamptz, $5, $6, $7, coalesce($8, false))
       on conflict (organization_id, conversation_id, rodada_em) do update
         set nota = coalesce(excluded.nota, chatbot_avaliacoes.nota),
             escala = coalesce(excluded.escala, chatbot_avaliacoes.escala),
             comentou = chatbot_avaliacoes.comentou or excluded.comentou,
             updated_at = now()`,
      [
        e.organizationId,
        fluxoId,
        sessao.id,
        sessao.started_at,
        e.conversationId,
        campos.nota ?? null,
        campos.escala ?? null,
        campos.comentou ?? null,
      ],
    );
  let boundary = e.boundary ?? null;
  if (!boundary && e.inboundMessageId) {
    const { rows: b } = await pool.query(
      `select organization_id, contact_id, conversation_id, service_revision::float8 as service_revision,
              demanda_id, demanda_revision::float8 as demanda_revision
         from messages where organization_id = $1 and id = $2 and direction = 'inbound'`,
      [e.organizationId, e.inboundMessageId],
    );
    boundary = parseServiceBoundary(b[0] ?? null);
  }

  const enviar = async (corpo: Record<string, unknown>) => {
    if (!e.channelSessionId || !boundary) {
      log.warn("chatbot: sem número ou atendimento para enviar — mensagem não saiu");
      return;
    }
    await espacarEnvio(e.channelSessionId);
    const enviada = (await sendMessageHandler(
      admin,
      {
        organization_id: e.organizationId,
        serviceBoundary: boundary,
        ...(e.proativo
          ? { proactiveContext: { organizationId: e.organizationId, contactId: e.contactId } }
          : {}),
        actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
        requestId,
      },
      { conversation_id: e.conversationId, ...corpo } as Parameters<typeof sendMessageHandler>[2],
    )) as { status?: string } | null;
    if (enviada?.status === "failed")
      log.warn("chatbot: envio marcado como falho", { flow_id: fluxoId });
  };

  for (const efeito of efeitos) {
    try {
      switch (efeito.tipo) {
        case "enviar":
          await enviar({ type: "text", body: efeito.texto });
          break;
        case "midia": {
          // Só arquivo do chatbot DESTA organização: o desenho é gravável pela
          // tela, e a cópia é feita com service role.
          const destino = await midiaDoChatbotDaOrg(admin, {
            organizationId: e.organizationId,
            conversationId: e.conversationId,
            origem: efeito.storage_path,
          });
          if (!destino) {
            log.warn("chatbot: arquivo do passo 'Enviar mídia' não pôde ser preparado", {
              flow_id: fluxoId,
            });
            break;
          }
          await enviar({
            type: efeito.midia,
            media_storage_path: destino,
            ...(efeito.mime ? { media_mime: efeito.mime } : {}),
            ...(efeito.legenda && efeito.midia !== "audio" ? { body: efeito.legenda } : {}),
          });
          break;
        }
        case "negocio": {
          // A MESMA regra da automação "Criar ou mover negócio": move o negócio
          // aberto do contato no funil, transfere o que está aberto em outro
          // funil, ou cria — nunca dois negócios abertos para o mesmo contato.
          const { rows: c } = await pool.query<{
            name: string | null;
            display_name: string | null;
            phone_number: string | null;
          }>(
            `select name, display_name, phone_number from contacts where organization_id = $1 and id = $2`,
            [e.organizationId, e.contactId],
          );
          const titulo =
            efeito.titulo ||
            (c[0] ? (nomeDoContato(c[0]) ?? c[0].phone_number) : null) ||
            "Contato do chatbot";
          const r = await levarContatoAoFunil(
            admin,
            {
              organization_id: e.organizationId,
              actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
              requestId,
            },
            { id: e.contactId },
            efeito.pipeline_id,
            efeito.stage_id,
            {
              tituloNovo: titulo.length >= 2 ? titulo.slice(0, 200) : "Contato do chatbot",
              source: "chatbot",
              quem: "pelo chatbot",
            },
          );
          if (!r.ok) {
            log.warn("chatbot: negócio não foi para o funil", {
              flow_id: fluxoId,
              motivo: r.error,
            });
            await notaInterna(`O chatbot não conseguiu pôr o contato no funil (${r.error}).`);
          }
          break;
        }
        case "etiquetas": {
          const { rows } = await pool.query<{ tags: string[] | null }>(
            `select tags from contacts where organization_id = $1 and id = $2`,
            [e.organizationId, e.contactId],
          );
          const antes = rows[0]?.tags ?? [];
          // Mesma forma que o resto do CRM grava (minúscula, até 40): "VIP"
          // gravado cru não casaria com o filtro de etiqueta da tela.
          const remover = new Set(efeito.remover.map(normalizarTag));
          const adicionar = [...new Set(efeito.adicionar.map(normalizarTag).filter(Boolean))];
          const depois = [
            ...antes.filter((t) => !remover.has(normalizarTag(t))),
            ...adicionar.filter((t) => !antes.some((a) => normalizarTag(a) === t)),
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
        case "nota":
          // Nota interna: a equipe vê na conversa, o contato nunca.
          await notaInterna(efeito.texto);
          break;
        case "avaliacao": {
          await gravarAvaliacao({ nota: efeito.nota, escala: efeito.escala });
          const de = efeito.escala === "1_5" ? 5 : 10;
          await notaInterna(`Avaliação do atendimento: ${efeito.nota} de ${de}.`);
          break;
        }
        case "feedback":
          // O texto do contato fica na conversa (nota interna); a tabela de
          // avaliações guarda só que houve comentário.
          await gravarAvaliacao({ comentou: true });
          await notaInterna(`Comentário do contato sobre o atendimento: ${efeito.texto}`);
          break;
        case "followup": {
          // O mesmo caminho da tela e das automações: valida o fluxo publicado,
          // escolhe o agente que arma, recusa o segundo follow-up ativo do contato.
          const r = await enrollFollowupFlow(admin, {
            organizationId: e.organizationId,
            pointerId: efeito.pointer_id,
            contactId: e.contactId,
            actorUserId: null,
            requestId,
            ...(boundary ? { resolveServiceBoundary: async () => boundary } : {}),
          });
          const { rows: fluxo } = await pool.query<{ name: string }>(
            `select name from followup_flow_pointers where organization_id = $1 and id = $2`,
            [e.organizationId, efeito.pointer_id],
          );
          const nomeDoFollowup = fluxo[0]?.name ?? "follow-up";
          if (r.ok) {
            await notaInterna(`O chatbot pôs o contato no follow-up "${nomeDoFollowup}".`);
          } else {
            log.warn("chatbot: follow-up não iniciado", { flow_id: fluxoId, codigo: r.code });
            if (r.code === "conflict")
              await notaInterna(
                `O chatbot tentou o follow-up "${nomeDoFollowup}", mas o contato já está em outro follow-up ativo.`,
              );
          }
          break;
        }
        case "notificar": {
          // O aviso da Central leva só o texto que quem montou o fluxo
          // escreveu, sem as respostas do contato (o título do aviso sai do
          // CRM em push); o texto preenchido fica na conversa, como nota.
          if (efeito.texto) await notaInterna(`Aviso do chatbot: ${efeito.texto}`);
          await insertInboxItem(
            pool,
            e.organizationId,
            {
              kind: "chatbot_aviso",
              severity: "warn",
              title: (efeito.modelo || "O chatbot pediu atenção nesta conversa").slice(0, 200),
              refKind: "conversation",
              refId: e.conversationId,
            },
            "kind_e_ref",
          );
          break;
        }
        case "campo_contato": {
          // Pelo mesmo handler da tela: audita antes/depois, emite
          // `contact.updated`, recusa contato anonimizado (LGPD).
          let patch: ContactPatch;
          if (efeito.campo === "nome") patch = { name: efeito.valor, display_name: efeito.valor };
          else if (efeito.campo === "email") patch = { email: efeito.valor };
          else if (efeito.campo === "aniversario") patch = { birthdate: efeito.valor };
          else {
            const { rows } = await pool.query<{ custom_fields: Record<string, unknown> | null }>(
              `select custom_fields from contacts where organization_id = $1 and id = $2`,
              [e.organizationId, e.contactId],
            );
            patch = {
              custom_fields: { ...(rows[0]?.custom_fields ?? {}), [efeito.chave]: efeito.valor },
            };
          }
          const valido = contactPatchSchema.safeParse(patch);
          if (!valido.success) {
            log.warn("chatbot: valor recusado para o campo do contato", {
              flow_id: fluxoId,
              campo: efeito.campo,
            });
            break;
          }
          await patchContactHandler(
            admin,
            {
              organization_id: e.organizationId,
              actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
              requestId,
            },
            e.contactId,
            valido.data,
          );
          break;
        }
        case "bloquear": {
          // Igual ao "parar de receber" da entrada: nem chatbot, nem IA, nem
          // campanha escrevem mais para este contato.
          await pool.query(
            `update contacts set is_blocked = true, blocked_reason = 'chatbot', blocked_at = now(), updated_at = now()
              where organization_id = $1 and id = $2`,
            [e.organizationId, e.contactId],
          );
          void audit({
            action: "contact.blocked",
            actorUserId: null,
            organizationId: e.organizationId,
            resourceType: "contact",
            resourceId: e.contactId,
            requestId,
            bypassedRls: true,
            metadata: { reason: "chatbot", contact_id: e.contactId, flow_id: fluxoId },
          });
          await notaInterna("O chatbot bloqueou este contato: ele não recebe mais mensagens.");
          break;
        }
        case "pedido_exclusao": {
          // Um pedido aberto por contato basta: repetir a frase não abre outro.
          const { rows: aberto } = await pool.query<{ id: string }>(
            `select id from lgpd_requests
              where organization_id = $1 and contact_id = $2 and request_type = 'redact'
                and status in ('received', 'processing')
              limit 1`,
            [e.organizationId, e.contactId],
          );
          if (aberto[0]) break;
          // Fica "recebido" até um admin aprovar em Configurações › LGPD — o
          // chatbot nunca dispara o apagamento sozinho.
          const pedido = await createLgpdRequest({
            organizationId: e.organizationId,
            requestType: "redact",
            source: "manual",
            contactId: e.contactId,
            receivedAt: new Date(),
            slaDays: 15,
            payload: { origem: "chatbot", flow_id: fluxoId, conversation_id: e.conversationId },
          });
          void audit({
            action: "lgpd.redact_received",
            actorUserId: null,
            organizationId: e.organizationId,
            resourceType: "lgpd_request",
            resourceId: pedido.id,
            requestId,
            bypassedRls: true,
            metadata: { origem: "chatbot", flow_id: fluxoId, due_at: pedido.due_at },
          });
          await notaInterna(
            "O contato pediu a exclusão dos dados. O pedido (LGPD) espera a aprovação de um admin.",
          );
          await insertInboxItem(
            pool,
            e.organizationId,
            {
              kind: "chatbot_aviso",
              severity: "warn",
              title: "Pedido de exclusão de dados (LGPD) aberto pelo chatbot",
              refKind: "conversation",
              refId: e.conversationId,
            },
            "kind_e_ref",
          );
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
