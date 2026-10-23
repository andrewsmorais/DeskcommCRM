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
import {
  continuarAposWebhook,
  continuarFluxo,
  iniciarFluxo,
  inicioPorAutomacao,
  pontoDePartida,
  respondeMensagens,
  retomarFluxo,
  seguirAoResponder,
  type ContextoDoTurno,
  type Efeito,
  type RespostaDoWebhook,
  type ResultadoDoTurno,
  type SessaoDoChatbot,
} from "./motor";
import { lerConfig } from "./passos";
import { decifrarSegredosDoPasso } from "./segredos";
import { chamarWebhookDoChatbot } from "./webhook";

/** Teto de WebHooks numa mensagem só: um desenho em círculo não vira metralhadora. */
export const WEBHOOKS_POR_TURNO = 3;

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
      status: sessaoEsperando.status === "waiting_timer" ? "waiting_timer" : "waiting_input",
      tentativas: sessaoEsperando.tentativas ?? 0,
      dados: dadosDeTexto(sessaoEsperando.collected_data),
    };
    // Parado no relógio e o passo diz "continuar esperando": a mensagem fica
    // para a equipe ver na conversa, e nem o chatbot nem a IA respondem agora.
    if (sessaoAnterior.status === "waiting_timer" && !seguirAoResponder(grafo, sessaoAnterior.no_atual)) {
      log.info("chatbot: mensagem durante a espera — o fluxo segue esperando o relógio", {
        flow_id: fluxoId,
        session_id: sessaoId,
      });
      return "atendeu";
    }
  } else {
    // Vários fluxos podem estar ligados, mas só um responde a mensagens (tem
    // "Iniciar por um canal"); os de "Iniciar por automação" esperam a regra.
    const { rows: fluxos } = await pool.query<{ id: string; grafo: unknown }>(
      `select id, grafo from chatbot_flows
        where organization_id = $1 and is_active
        order by updated_at desc
        limit 50`,
      [e.organizationId],
    );
    let escolhido: { id: string; grafo: Grafo } | null = null;
    for (const f of fluxos) {
      const g = grafoSchema.safeParse(f.grafo);
      if (g.success && respondeMensagens(g.data)) {
        escolhido = { id: f.id, grafo: g.data };
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

  const ctx = {
    mensagem: texto,
    agora: new Date(),
    fuso: conversa.timezone || "America/Sao_Paulo",
    contato: contatoDoTurno(conversa),
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
 * Grava cada trecho do turno e, quando o motor para num WebHook, faz a chamada
 * e devolve a resposta ao motor — até o fluxo parar de verdade (pergunta,
 * relógio, fim) ou o teto de chamadas por turno.
 */
async function conduzir(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  grafo: Grafo,
  sessaoId: string | null,
  inicial: ResultadoDoTurno,
  ctx: ContextoDoTurno,
  log: Log,
): Promise<void> {
  let resultado = inicial;
  let id = sessaoId;
  for (let chamadas = 0; ; chamadas++) {
    const gravada = await concluirTurno(pool, admin, e, fluxoId, id, resultado, log);
    id = gravada.id;
    if (!resultado.pendente) return;
    if (chamadas >= WEBHOOKS_POR_TURNO) {
      log.warn("chatbot: teto de WebHooks por mensagem — fluxo encerrado", { flow_id: fluxoId });
      await encerrarSessao(pool, e.organizationId, gravada.id, "completed");
      return;
    }
    const resposta = await fazerWebhook(pool, admin, e, fluxoId, grafo, resultado, ctx, log);
    resultado = continuarAposWebhook(grafo, resultado.sessao, resposta, ctx);
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
    log.warn("chatbot: segredo do WebHook não pôde ser decifrado — chamada não feita", { flow_id: fluxoId });
    return { ok: false, status: null, corpo: null };
  }
  const { rows } = await pool.query<{ nome: string | null; telefone: string | null; email: string | null }>(
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
      respostas: resultado.sessao.dados,
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
  const token = resultado.sessao.status === "waiting_timer" ? randomUUID() : null;
  const gravada = await gravarSessao(pool, e, fluxoId, sessaoAnteriorId, resultado.sessao, token);

  await executarEfeitos(pool, admin, e, fluxoId, gravada, resultado.efeitos, log);

  if (token && resultado.sessao.retomar_em) {
    // O relógio vira um comando no barramento, com hora marcada: o drain do
    // worker só o pega a partir de `next_attempt_at`. Sem cron novo.
    await pool.query(
      `insert into event_log
         (organization_id, event_type, entity_kind, entity_id, payload, metadata, next_attempt_at)
       values ($1, 'chatbot.retomada_requested', 'chatbot_session', $2, $3::jsonb, $4::jsonb, $5)`,
      [
        e.organizationId,
        gravada.id,
        JSON.stringify({
          session_id: gravada.id,
          token,
          conversation_id: e.conversationId,
          contact_id: e.contactId,
          channel_session_id: e.channelSessionId,
          inbound_message_id: e.inboundMessageId,
          boundary: e.inboundMessageId ? null : (e.boundary ?? null),
          proativo: Boolean(e.proativo),
        } satisfies PedidoDeRetomada),
        JSON.stringify({ source: "chatbot", flow_id: fluxoId }),
        resultado.sessao.retomar_em,
      ],
    );
  }
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
  const inicio = g.success ? inicioPorAutomacao(g.data) : null;
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
  if (!conversa || conversa.assignee_kind === "user" || conversa.is_blocked === true) return "descartado";

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

  const e: EntradaDoChatbot = {
    organizationId,
    conversationId: pedido.conversation_id,
    contactId: pedido.contact_id,
    channelSessionId: pedido.channel_session_id,
    inboundMessageId: null,
    boundary: pedido.boundary,
    proativo: true,
    referencia: `regra:${pedido.regra_id ?? "?"}`,
  };
  const ctx: ContextoDoTurno = {
    mensagem: null,
    agora: new Date(),
    fuso: conversa.timezone || "America/Sao_Paulo",
    contato: contatoDoTurno(conversa),
  };
  const resultado = iniciarFluxo(g.data, inicio, ctx, pedido.variaveis);
  // `null` = rodada nova: a gravação reinicia `started_at` mesmo que o fluxo
  // já tenha rodado nesta conversa (a avaliação de cada rodada fica separada).
  await conduzir(pool, admin, e, fluxo.id, g.data, null, resultado, ctx, log);
  log.info("chatbot: fluxo iniciado por automação", { flow_id: fluxo.id, regra_id: pedido.regra_id });
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
    SessaoGravada & { retomar_em: string | null; timezone: string | null }
  >(
    `select s.id, s.flow_id, s.status, s.no_atual, s.tentativas, s.collected_data, s.retomar_em,
            f.grafo, f.is_active, o.timezone
       from chatbot_sessions s
       join chatbot_flows f on f.id = s.flow_id and f.organization_id = s.organization_id
       join organizations o on o.id = s.organization_id
      where s.organization_id = $1 and s.id = $2
        and s.status = 'waiting_timer' and s.retomada_token = $3::uuid`,
    [organizationId, pedido.session_id, pedido.token],
  );
  const sessao = rows[0];
  if (!sessao) return "descartado";

  if (sessao.retomar_em && new Date(sessao.retomar_em).getTime() > Date.now() + 1_000)
    return { adiarAte: sessao.retomar_em };

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
  if (!conversa || conversa.assignee_kind === "user" || conversa.is_blocked === true) {
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
      s.status === "waiting_timer" ? (s.retomar_em ?? null) : null,
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
              ...(e.proativo
                ? { proactiveContext: { organizationId: e.organizationId, contactId: e.contactId } }
                : {}),
              actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
              requestId,
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
            patch = { custom_fields: { ...(rows[0]?.custom_fields ?? {}), [efeito.chave]: efeito.valor } };
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
