/**
 * Liga o motor do chatbot (lib/chatbot/motor.ts, puro) ao WhatsApp e ao CRM.
 *
 * Chamado pelo drain do agente (lib/agent-engine/edge/crm/drain.ts) para cada
 * mensagem que chega, ANTES de decidir se a IA responde:
 *   - `atendeu`    → o chatbot conduziu esta mensagem; a IA não é acordada;
 *   - `{ adiarAte }` → fora da janela de envio do número; o evento volta quando ela abrir;
 *   - `nao_atende` → nenhum fluxo para esta conversa; segue o caminho da IA.
 *
 * Sem IA em ponto nenhum — "Transferir p/ agentes de IA" só devolve a conversa
 * ao atendimento automático, e quem responde dali em diante é o agente, pelo
 * caminho de sempre. Envia pelo mesmo caminho das automações
 * (`sendMessageHandler` + espaçamento entre mensagens + janela do número), com
 * as mesmas guardas do contato. Falha ao ler o fluxo devolve `nao_atende`
 * (fail-open): um erro do chatbot não pode calar a conversa.
 */
import { comPrefixoDaEmpresa, lerVariaveisDaEmpresa, semVariaveisDaEmpresa } from "@/lib/empresa/variaveis";
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

import { acessoPeloPlanoDaOrganizacao, verificarRecursoDoPlano } from "@/lib/billing/acesso";
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
import { loadEligibleAttendants, type RoutingScope } from "@/lib/routing/eligibles";
import { enviarPushAoUsuario } from "@/lib/notifications/web_push";
import { escolherAtendente, notaSemAtendente } from "./atendente-do-passo";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { horariosLivresDaOrg } from "@/lib/agenda/consulta";
import { rotuloLocal } from "@/lib/tempo/agora";
import {
  alterarAgendamentoHandler,
  cancelarAgendamentoHandler,
  marcarAgendamentoHandler,
} from "@/app/api/v1/agenda/agendamentos/_handler";
import { levarContatoAoFunil } from "@/lib/leads/levar-ao-funil";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { ApiError } from "@/lib/api/types";
import {
  continuarAposAcao,
  continuarAposCancelar,
  continuarAposMarcar,
  continuarAposWebhook,
  continuarComHorarios,
  continuarFluxo,
  iniciarFluxo,
  inicioParaAcionar,
  inicioManual,
  inicioPorAutomacao,
  inicioQueAtende,
  pontoDePartida,
  proximaMensagemDeEspera,
  relogioDaEspera,
  respondeMensagens,
  respostasVisiveis,
  retomarFluxo,
  seguirAoResponder,
  CHAVE_DO_AGENDAMENTO,
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
import { formatCents } from "@/lib/money";
import {
  copiarFotoNoStorage,
  LIMITE_DA_LEGENDA,
  prepararFotosDoProduto,
  type FotoParaEnvio,
} from "@/lib/agent-engine/agent/fotos-do-produto";
import { escolherOfertas } from "./ofertas";
import { quemPodeAssumirAgora } from "@/lib/escalacao/disponibilidade";
import { createLgpdRequest } from "@/lib/lgpd/repository";
import { lerConfig } from "./passos";
import { decifrarSegredosDoPasso } from "./segredos";
import { chamarWebhookDoChatbot } from "./webhook";
import { capacidadeDoNumero, temQuemAtenda } from "@/lib/ai/agents/capacidade-do-numero";
import { devolverAtendimentoAoAgente } from "@/lib/escalacao/retomada";
import { resolverModeloAprovadoNaConexao } from "@/lib/channels/meta/modelo-aprovado-da-conexao";
import { transferirParaSetor } from "@/lib/setores/servico";

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
  /** Quantos "em paralelo" encadeados trouxeram até aqui (trava de laço). */
  paralelos?: number;
};

/** Um fluxo em paralelo pode abrir outro, que pode abrir outro — até aqui. */
export const PARALELOS_ENCADEADOS_MAX = 3;

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
  tags_da_conversa?: string[] | null;
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
    tags_da_conversa: c.tags_da_conversa ?? [],
    nome: c.nome,
    email: c.email,
    aniversario: c.aniversario,
    personalizados,
  };
}

/** As variáveis da empresa (`organizations.settings.variaveis`) prontas para o motor. */
function variaveisDoTurno(bruto: unknown): Record<string, string> {
  return comPrefixoDaEmpresa(lerVariaveisDaEmpresa({ variaveis: bruto }));
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
    tags_da_conversa: string[] | null;
    variaveis_da_empresa: unknown;
  }>(
    `select c.assignee_kind, ct.is_blocked, o.timezone, o.settings->'variaveis' as variaveis_da_empresa,
            ct.tags, coalesce(ct.name, ct.display_name) as nome, ct.email,
            ct.birthdate::text as aniversario, ct.custom_fields, c.tags as tags_da_conversa
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
    // UM ATENDIMENTO, UMA PASSAGEM PELO CHATBOT (como na Umbler Talk). Depois
    // que o chatbot entregou a conversa — à fila da equipe, a um setor, a um
    // atendente ou ao agente de IA —, ele não volta a entrar neste atendimento:
    // volta quando o atendimento é finalizado e o contato escreve de novo.
    // Antes a única barreira era a de 6 h, e quem ficasse sem resposta na fila
    // (ou com a IA) recebia o menu de novo no meio do atendimento (cards 54/58).
    if (await atendimentoJaEntregue(pool, e.organizationId, e.conversationId)) return "nao_atende";

    // Cada número tem o seu chatbot de entrada (lib/chatbot/plano.ts): o
    // escolhido é o fluxo ligado cujo "Iniciar por um canal" aceita ESTE
    // número (e a palavra-chave, se houver). Antes era o primeiro fluxo da
    // organização, e a mensagem do segundo número ficava sem chatbot.
    // Os de "Iniciar por automação" ou "manualmente" esperam quem os chama.
    // A palavra-chave vence o "toda conversa nova" também ENTRE fluxos.
    const { rows: fluxos } = await pool.query<{ id: string; grafo: unknown }>(
      `select id, grafo from chatbot_flows
        where organization_id = $1 and is_active
        order by updated_at desc
        limit 50`,
      [e.organizationId],
    );
    let escolhido: {
      id: string;
      grafo: Grafo;
      gatilho: "toda_conversa_nova" | "palavra_chave";
    } | null = null;
    for (const f of fluxos) {
      const g = grafoSchema.safeParse(f.grafo);
      if (!g.success || !respondeMensagens(g.data)) continue;
      const inicioDoFluxo = inicioQueAtende(g.data, {
        channelSessionId: e.channelSessionId,
        mensagem: texto,
      });
      if (!inicioDoFluxo) continue;
      if (inicioDoFluxo.gatilho === "palavra_chave") {
        escolhido = { id: f.id, grafo: g.data, gatilho: "palavra_chave" };
        break;
      }
      escolhido ??= { id: f.id, grafo: g.data, gatilho: "toda_conversa_nova" };
    }
    if (!escolhido) return "nao_atende";
    fluxoId = escolhido.id;
    grafo = escolhido.grafo;

    // "Toda conversa nova" = atendimento novo. Já rodou NESTE atendimento: não
    // recomeça a cada "obrigado". As 6 h ficam só como rede para quem nunca
    // finaliza atendimento (senão o contato que volta semanas depois nunca mais
    // veria o menu). A palavra-chave é pedido explícito do contato e recomeça.
    if (escolhido.gatilho === "toda_conversa_nova") {
      const { rows: recente } = await pool.query<{ id: string }>(
        `select s.id from chatbot_sessions s
           join conversations c on c.id = s.conversation_id and c.organization_id = s.organization_id
          where s.organization_id = $1 and s.conversation_id = $2 and s.flow_id = $3
            and s.started_at >= coalesce(c.service_started_at, c.created_at)
            and coalesce(s.ended_at, s.updated_at) > now() - make_interval(hours => $4)`,
        [e.organizationId, e.conversationId, fluxoId, HORAS_PARA_RECOMECAR],
      );
      if (recente[0]) return "nao_atende";
    }
  }

  const inicio = sessaoAnterior
    ? null
    : pontoDePartida(grafo, { channelSessionId: e.channelSessionId, mensagem: texto });
  if (!sessaoAnterior && !inicio) return "nao_atende";

  // Organização suspensa ou sem assinatura ativa: o chatbot também para (mesma régua da IA).
  const acesso = await acessoPeloPlanoDaOrganizacao(e.organizationId, pool);
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
    empresa: variaveisDoTurno(conversa.variaveis_da_empresa),
    conversa: await lerFatosDaConversa(pool, e, fluxoId, grafo),
  };
  const resultado: ResultadoDoTurno = !sessaoAnterior
    ? iniciarFluxo(grafo, inicio!, ctx)
    : sessaoAnterior.status === "waiting_timer"
      ? retomarFluxo(grafo, sessaoAnterior, ctx)
      : continuarFluxo(grafo, sessaoAnterior, ctx);

  const conduzido = await conduzir(pool, admin, e, fluxoId, grafo, sessaoId, resultado, ctx, log);
  // "Transferir p/ agentes de IA" neste turno: a mensagem que chegou é do
  // agente agora — o drain segue o caminho da IA e ele a responde já.
  return conduzido.entregouAoAgente ? "nao_atende" : "atendeu";
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
): Promise<{ entregouAoAgente: boolean }> {
  let fluxoId = fluxoInicial;
  let grafo = grafoInicial;
  let ctx = ctxInicial;
  let resultado = inicial;
  let id = sessaoId;
  let webhooks = 0;
  let saltos = 0;
  let entregouAoAgente = false;
  for (let pendentes = 0; ; pendentes++) {
    const gravada = await concluirTurno(pool, admin, e, fluxoId, id, resultado, log);
    id = gravada.id;
    const pendente: Pendente | undefined = resultado.pendente;
    if (!pendente) return { entregouAoAgente };
    if (pendentes >= PENDENTES_POR_TURNO) {
      log.warn("chatbot: teto de passos externos por mensagem — fluxo encerrado", {
        flow_id: fluxoId,
      });
      await encerrarSessao(pool, e.organizationId, gravada.id, "completed");
      return { entregouAoAgente };
    }
    switch (pendente.tipo) {
      case "webhook": {
        if (++webhooks > WEBHOOKS_POR_TURNO) {
          log.warn("chatbot: teto de WebHooks por mensagem — fluxo encerrado", {
            flow_id: fluxoId,
          });
          await encerrarSessao(pool, e.organizationId, gravada.id, "completed");
          return { entregouAoAgente };
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
          return { entregouAoAgente };
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
          return { entregouAoAgente };
        }
        // O fluxo anterior pode ter mudado etiqueta ou campo: o novo enxerga.
        ctx = {
          ...ctx,
          contato: (await lerContatoDoTurno(pool, e)) ?? ctx.contato,
          conversa: await lerFatosDaConversa(pool, e, alvo.id, alvo.grafo),
        };
        log.info("chatbot: fluxo acionou outro fluxo", { de: fluxoId, para: alvo.id });
        resultado = iniciarFluxo(
          alvo.grafo,
          alvo.inicio,
          ctx,
          {
            ...respostasVisiveis(resultado.sessao.dados),
            // Fluxo começado por um atendente segue sendo dele no fluxo chamado.
            ...(resultado.sessao.dados[CHAVE_MANUAL] ? { [CHAVE_MANUAL]: "1" } : {}),
          },
          false,
        );
        fluxoId = alvo.id;
        grafo = alvo.grafo;
        // Rodada nova no outro fluxo (a avaliação de cada rodada fica separada).
        id = null;
        break;
      }
      case "horarios": {
        const h = await buscarHorarios(admin, e, grafo, pendente.no, log);
        resultado = continuarComHorarios(grafo, resultado.sessao, h.ofertas, ctx, h.extra);
        break;
      }
      case "cancelar": {
        const r = await cancelarProximoAgendamento(admin, e, fluxoId, grafo, pendente.no, log);
        resultado = continuarAposCancelar(grafo, resultado.sessao, r.desfecho, r.quando, ctx);
        break;
      }
      case "marcar": {
        const r = await marcarHorario(admin, e, fluxoId, grafo, pendente, gravada.id, log);
        resultado = continuarAposMarcar(grafo, resultado.sessao, r, ctx);
        break;
      }
      case "ia": {
        const entregou = await entregarAoAgente(pool, admin, e, fluxoId, pendente.agent_id, log);
        if (entregou) {
          entregouAoAgente = true;
          await marcarEntrega(pool, e.organizationId, gravada.id, "ia");
        }
        resultado = continuarAposAcao(grafo, resultado.sessao, entregou, ctx);
        break;
      }
      case "template": {
        const saiu = await enviarModeloAprovado(
          pool,
          admin,
          e,
          fluxoId,
          gravada.id,
          pendente.template_id,
          log,
        );
        resultado = continuarAposAcao(grafo, resultado.sessao, saiu, ctx);
        break;
      }
      case "mensagem": {
        // "Enviar mensagem" com caminho de falha: manda agora e segue pela
        // saída do que ACONTECEU (a mensagem comum sai com as outras do turno).
        const requestId = `chatbot:${fluxoId}:${e.inboundMessageId ?? e.referencia ?? gravada.id}:${pendente.no}`;
        const { enviar } = await prepararEnvio(pool, admin, e, fluxoId, requestId, log);
        const saiu = await enviar({ type: "text", body: pendente.texto }).catch((err: unknown) => {
          log.warn("chatbot: mensagem com caminho de falha não saiu", {
            flow_id: fluxoId,
            erro: String(err).slice(0, 160),
          });
          return false;
        });
        resultado = continuarAposAcao(grafo, resultado.sessao, saiu, ctx);
        break;
      }
      case "setor": {
        const existe = await setorParaTransferir(pool, e, pendente.setor_id, pendente.setor_da_conversa);
        if (!existe)
          log.info("chatbot: transferência sem setor — fluxo segue por 'Não transferiu'", { flow_id: fluxoId });
        resultado = continuarAposAcao(grafo, resultado.sessao, existe, ctx);
        break;
      }
    }
  }
}

/**
 * O "Transferir" com caminho de falha tem para onde ir? O setor do passo
 * existe NESTA empresa — ou, no modo "o setor em que a conversa já estava", a
 * conversa tem um setor que ainda existe.
 */
async function setorParaTransferir(
  pool: pg.Pool,
  e: EntradaDoChatbot,
  setorId: string | null,
  daConversa: boolean,
): Promise<boolean> {
  const { rows } = await pool.query<{ existe: boolean }>(
    daConversa
      ? `select exists (
           select 1 from conversations c join setores s
             on s.organization_id = c.organization_id and s.id = c.setor_id
            where c.organization_id = $1 and c.id = $2) as existe`
      : `select exists (select 1 from setores where organization_id = $1 and id = $2) as existe`,
    [e.organizationId, daConversa ? e.conversationId : setorId],
  );
  return rows[0]?.existe === true;
}

/**
 * Quem recebe a conversa no "Transferir p/ atendente", pelo modo do passo, ou
 * null quando não há ninguém (a conversa vai para a fila). Só atendente
 * (agent/manager/admin) ativo na organização recebe — em todos os modos.
 *
 *   - específico: o escolhido no passo, esteja ou não disponível agora (é a
 *     escolha explícita de quem montou o fluxo, como na Umbler);
 *   - rodízio / menos conversas: entre quem a Distribuição de atendimento
 *     consideraria agora (disponível ∧ no horário ∧ com folga). Sem lista no
 *     passo valem as regras da conversa (responsáveis do número e setor); com
 *     lista, a lista é a escolha explícita e substitui as duas;
 *   - quem atendeu antes: o último atendente que esta conversa (ou outra do
 *     mesmo contato no mesmo número) recebeu e que segue na equipe.
 */
async function atendenteDoPasso(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  efeito: Extract<Efeito, { tipo: "transferir_atendente" }>,
  log: Log,
): Promise<string | null> {
  if (efeito.modo === "especifico") {
    if (!efeito.user_id) return null;
    const { rows } = await pool.query<{ ok: boolean }>(
      `select true as ok
         from user_organizations
        where organization_id = $1 and user_id = $2 and revoked_at is null
          and role in ('agent', 'manager', 'admin')`,
      [e.organizationId, efeito.user_id],
    );
    return rows[0] ? efeito.user_id : null;
  }
  if (efeito.modo === "anterior_mesma_conversa") {
    // Quem atendeu ESTA conversa por último (e ainda é da equipe).
    const { rows } = await pool.query<{ user_id: string }>(
      `select ev.to_user_id as user_id
         from conversation_assignment_events ev
         join user_organizations uo
           on uo.organization_id = ev.organization_id and uo.user_id = ev.to_user_id
          and uo.revoked_at is null and uo.role in ('agent', 'manager', 'admin')
        where ev.organization_id = $1 and ev.conversation_id = $2 and ev.to_user_id is not null
        order by ev.created_at desc
        limit 1`,
      [e.organizationId, e.conversationId],
    );
    return rows[0]?.user_id ?? null;
  }
  if (efeito.modo === "variavel") {
    // Id ou e-mail de alguém da equipe DESTA organização; o resto vai para a fila.
    const quem = (efeito.quem ?? "").trim();
    if (!quem) return null;
    const ehId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quem);
    const { rows } = await pool.query<{ user_id: string }>(
      `select uo.user_id
         from user_organizations uo
         join auth.users u on u.id = uo.user_id
        where uo.organization_id = $1 and uo.revoked_at is null
          and uo.role in ('agent', 'manager', 'admin')
          and ${ehId ? "uo.user_id = $2::uuid" : "lower(u.email) = lower($2)"}
        limit 1`,
      [e.organizationId, quem],
    );
    return rows[0]?.user_id ?? null;
  }
  if (efeito.modo === "remover") return null;
  if (efeito.modo === "anterior") {
    const { rows } = await pool.query<{ user_id: string }>(
      `select ev.to_user_id as user_id
         from conversation_assignment_events ev
         join conversations c
           on c.id = ev.conversation_id and c.organization_id = ev.organization_id
         join user_organizations uo
           on uo.organization_id = ev.organization_id and uo.user_id = ev.to_user_id
          and uo.revoked_at is null and uo.role in ('agent', 'manager', 'admin')
        where ev.organization_id = $1
          and ev.to_user_id is not null
          and c.contact_id = $2
          and c.channel_session_id is not distinct from $3
        order by ev.created_at desc
        limit 1`,
      [e.organizationId, e.contactId, e.channelSessionId],
    );
    return rows[0]?.user_id ?? null;
  }
  // Rodízio e menos conversas são a Distribuição automática do plano por dentro
  // do fluxo. O desenho já é barrado ao gravar; aqui cobre o fluxo gravado ANTES
  // de um downgrade — a mesma régua do worker de roteamento: sem o recurso, a
  // conversa vai para a fila da equipe. Leitura do plano indisponível também
  // manda para a fila (não distribui às cegas, e a conversa não se perde).
  const acesso = await verificarRecursoDoPlano(e.organizationId, "distribuicao_automatica");
  if (!acesso.ok) {
    log.info("chatbot: plano sem distribuição automática — conversa na fila", {
      modo: efeito.modo,
      motivo: acesso.code,
    });
    return null;
  }
  const { rows: conversa } = await pool.query<{
    channel_session_id: string | null;
    setor_id: string | null;
  }>(
    `select channel_session_id, setor_id from conversations where organization_id = $1 and id = $2`,
    [e.organizationId, e.conversationId],
  );
  const canal = conversa[0]?.channel_session_id ?? null;
  const escopo: RoutingScope =
    efeito.atendentes.length > 0 || !canal
      ? { kind: "organization_summary" }
      : {
          kind: "conversation_channel",
          channelSessionId: canal,
          setorId: conversa[0]?.setor_id ?? null,
        };
  try {
    const candidatos = await loadEligibleAttendants(admin, e.organizationId, new Date(), escopo);
    return efeito.modo === "rodizio" || efeito.modo === "menos_conversas"
      ? escolherAtendente(efeito.modo, candidatos, efeito.atendentes)
      : null;
  } catch (err) {
    log.warn("chatbot: não deu para ler quem está disponível — conversa na fila", {
      modo: efeito.modo,
      erro: (err as Error).message.slice(0, 120),
    });
    return null;
  }
}

/**
 * "Transferir p/ agentes de IA": devolve a conversa ao atendimento automático
 * pela MESMA função do botão "Devolver ao agente" da Inbox e do prazo de
 * devolução (`devolverAtendimentoAoAgente`: solta as travas, grava checkpoint,
 * emite `ai.handoff_resolved`). Antes, confere se há agente no ar no número —
 * a mesma régua do portão do drain (`capacidadeDoNumero`): entregar a um número
 * sem agente deixaria o contato falando sozinho. false = siga por "Sem agente de IA".
 */
/**
 * O atendimento ATUAL já foi entregue a alguém? (o chatbot então não entra)
 *
 * O atendimento atual começa em `conversations.service_started_at` (finalizar e
 * o contato escrever de novo abre outro). Conta como entregue:
 *   - o próprio chatbot ter entregue neste atendimento (`chatbot_sessions.entregue_em`):
 *     à equipe, a um setor, a um atendente ou ao agente de IA — a IA devolvida
 *     não deixa rastro na conversa, por isso o rastro mora na sessão;
 *   - uma passagem para humano neste atendimento (`last_handoff_at`), feita pela
 *     IA, pela tela ou pelo chatbot;
 *   - o robô calado por alguém com prazo (`bot_silenced_until` no futuro). O
 *     "para sempre" de uma passagem de um atendimento ANTERIOR não conta: o
 *     atendimento novo começa do zero, como na Umbler.
 * O dono humano (`assignee_kind = 'user'`) já é barrado antes, por quem chama.
 */
async function atendimentoJaEntregue(
  pool: pg.Pool,
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ entregue: boolean }>(
    `select (
        exists (select 1 from chatbot_sessions s
                 where s.organization_id = c.organization_id and s.conversation_id = c.id
                   and s.entregue_em is not null
                   and s.entregue_em >= coalesce(c.service_started_at, c.created_at))
        or (c.last_handoff_at is not null
            and c.last_handoff_at >= coalesce(c.service_started_at, c.created_at))
        or (c.bot_silenced_until is not null and c.bot_silenced_until > now()
            and not (c.bot_silenced_until = 'infinity'::timestamptz
                     and (c.last_handoff_at is null
                          or c.last_handoff_at < coalesce(c.service_started_at, c.created_at))))
      ) as entregue
       from conversations c
      where c.organization_id = $1 and c.id = $2`,
    [organizationId, conversationId],
  );
  return rows[0]?.entregue === true;
}

/** Rastro da entrega na sessão: o chatbot não volta a entrar neste atendimento. */
async function marcarEntrega(
  pool: pg.Pool,
  organizationId: string,
  sessaoId: string,
  a: "ia" | "equipe" | "atendente",
): Promise<void> {
  await pool.query(
    `update chatbot_sessions set entregue_a = $3, entregue_em = now()
      where organization_id = $1 and id = $2`,
    [organizationId, sessaoId, a],
  );
}

async function entregarAoAgente(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  agentId: string | null,
  log: Log,
): Promise<boolean> {
  if (!e.channelSessionId) return false;
  if (agentId) {
    // Agente nomeado no passo: tem de existir NESTA organização, publicado e não
    // arquivado. Senão segue por "Sem agente de IA" — nunca entrega a conversa
    // a quem não vai responder.
    const { rows } = await pool.query<{ ok: boolean }>(
      `select true as ok from ai_agents
        where organization_id = $1 and id = $2
          and published_version_id is not null and archived_at is null`,
      [e.organizationId, agentId],
    );
    if (!rows[0]) {
      log.info("chatbot: agente escolhido no passo não está publicado", { flow_id: fluxoId });
      return false;
    }
  } else {
    const capacidade = await capacidadeDoNumero(pool, e.organizationId, e.channelSessionId);
    if (!temQuemAtenda(capacidade)) {
      log.info("chatbot: 'Transferir p/ agentes de IA' sem agente no ar no número", {
        flow_id: fluxoId,
      });
      return false;
    }
  }
  const r = await devolverAtendimentoAoAgente(
    {
      supabase: admin,
      organizationId: e.organizationId,
      actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
      requestId: `chatbot:${fluxoId}:${e.inboundMessageId ?? e.referencia ?? "ia"}`,
    },
    { conversationId: e.conversationId },
  );
  if (!r.ok) {
    log.warn("chatbot: entrega ao agente de IA falhou", { flow_id: fluxoId, erro: r.erro });
    return false;
  }
  if (agentId) {
    // Gravado DEPOIS da devolução (que não toca nestas colunas): é o que o
    // resolvedor do turno lê (`agenteEscolhidoPeloChatbot`).
    await pool.query(
      `update conversations
          set active_ai_agent_id = $3, active_intent = 'chatbot', active_agent_set_at = now()
        where organization_id = $1 and id = $2`,
      [e.organizationId, e.conversationId, agentId],
    );
  }
  log.info("chatbot: conversa entregue ao agente de IA", { flow_id: fluxoId, escolhido: Boolean(agentId) });
  return true;
}

/**
 * "Enviar template": o modelo aprovado, resolvido pela MESMA regra do passo de
 * follow-up (`resolverModeloAprovadoNaConexao`), sai pelo handler de mensagens
 * como `type: "template"`. Recusa (número por QR Code, modelo pausado, modelo com
 * variável) vira nota na conversa com o motivo, e o fluxo segue por "Não enviado".
 */
async function enviarModeloAprovado(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  sessaoId: string,
  templateId: string,
  log: Log,
): Promise<boolean> {
  const requestId = `chatbot:${fluxoId}:${e.inboundMessageId ?? e.referencia ?? sessaoId}`;
  const avisar = (texto: string) => notaDoChatbot(pool, e, fluxoId, requestId, texto);
  if (!e.channelSessionId) {
    await avisar("O chatbot não enviou o modelo: a conversa não tem número de WhatsApp.");
    return false;
  }
  const modelo = await resolverModeloAprovadoNaConexao(
    pool,
    e.organizationId,
    e.channelSessionId,
    templateId,
  );
  if (modelo === null || modelo.tipo === "recusado") {
    const motivo = modelo === null ? "o modelo escolhido não existe mais." : modelo.motivo;
    log.info("chatbot: modelo não enviado", { flow_id: fluxoId, motivo });
    await avisar(`O chatbot não enviou o modelo do passo "Enviar template": ${motivo}`);
    return false;
  }
  const { enviar } = await prepararEnvio(pool, admin, e, fluxoId, requestId, log);
  const saiu = await enviar({
    type: "template",
    template_name: modelo.modelo.name,
    template_language: modelo.modelo.language,
    template_values: modelo.modelo.values,
    body: modelo.body,
  }).catch((err: unknown) => {
    log.warn("chatbot: envio do modelo falhou", {
      flow_id: fluxoId,
      erro: String(err).slice(0, 160),
    });
    return false;
  });
  if (!saiu) await avisar("O chatbot tentou enviar o modelo, mas a plataforma recusou o envio.");
  return saiu;
}

/** Teto da tela (`conversationTagsSchema`): uma conversa guarda até 20 etiquetas. */
const MAXIMO_DE_ETIQUETAS_DA_CONVERSA = 20;

/**
 * "Editar etiquetas" com alvo na CONVERSA: grava em `conversations.tags` na
 * mesma forma da tela (minúscula, até 40 letras, sem repetir, até 20) e audita
 * como a rota da Inbox (`conversation.tags_changed`). Passou do teto, o que
 * sobra não entra e fica no log — a conversa não perde etiqueta que já tinha.
 */
async function editarEtiquetasDaConversa(
  pool: pg.Pool,
  e: EntradaDoChatbot,
  efeito: { adicionar: string[]; remover: string[] },
  fluxoId: string,
  requestId: string,
  log: Log,
): Promise<void> {
  const { rows } = await pool.query<{ tags: string[] | null }>(
    `select tags from conversations where organization_id = $1 and id = $2`,
    [e.organizationId, e.conversationId],
  );
  if (!rows[0]) return;
  const antes = rows[0].tags ?? [];
  const remover = new Set(efeito.remover.map(normalizarTag));
  const ficam = antes.filter((t) => !remover.has(normalizarTag(t)));
  const novas = [...new Set(efeito.adicionar.map(normalizarTag).filter(Boolean))].filter(
    (t) => !ficam.some((a) => normalizarTag(a) === t),
  );
  const cabem = Math.max(0, MAXIMO_DE_ETIQUETAS_DA_CONVERSA - ficam.length);
  if (novas.length > cabem)
    log.warn("chatbot: a conversa chegou ao teto de etiquetas — o excesso não entrou", {
      flow_id: fluxoId,
      fora: novas.length - cabem,
    });
  const depois = [...ficam, ...novas.slice(0, cabem)];
  if (depois.length === antes.length && depois.every((t, i) => t === antes[i])) return;
  await pool.query(
    `update conversations set tags = $3, updated_at = now() where organization_id = $1 and id = $2`,
    [e.organizationId, e.conversationId, depois],
  );
  void audit({
    action: "conversation.tags_changed",
    actorUserId: null,
    organizationId: e.organizationId,
    resourceType: "conversation",
    resourceId: e.conversationId,
    requestId,
    bypassedRls: true,
    metadata: { tags: depois, source: "chatbot", flow_id: fluxoId },
  });
}

/** Nota interna do chatbot na conversa (a equipe vê, o contato não), auditada. */
async function notaDoChatbot(
  pool: pg.Pool,
  e: EntradaDoChatbot,
  fluxoId: string,
  requestId: string,
  texto: string,
): Promise<void> {
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
}

/**
 * O envio do chatbot: resolve a fronteira do atendimento (da automação ou da
 * mensagem que chegou) e devolve a função que manda pelo `sendMessageHandler`,
 * com o espaçamento entre mensagens do número. A função devolve se a mensagem
 * saiu (false = sem número/atendimento, ou marcada como falha).
 */
async function prepararEnvio(
  pool: pg.Pool,
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  requestId: string,
  log: Log,
): Promise<{
  enviar: (corpo: Record<string, unknown>) => Promise<boolean>;
  boundary: ServiceBoundary | null;
}> {
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
  const enviar = async (corpo: Record<string, unknown>): Promise<boolean> => {
    if (!e.channelSessionId || !boundary) {
      log.warn("chatbot: sem número ou atendimento para enviar — mensagem não saiu");
      return false;
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
    if (enviada?.status === "failed") {
      log.warn("chatbot: envio marcado como falho", { flow_id: fluxoId });
      return false;
    }
    return true;
  };
  return { enviar, boundary };
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
    tags_da_conversa: string[] | null;
  }>(
    `select ct.tags, coalesce(ct.name, ct.display_name) as nome, ct.email,
            ct.birthdate::text as aniversario, ct.custom_fields, cv.tags as tags_da_conversa
       from contacts ct
       left join conversations cv
         on cv.organization_id = ct.organization_id and cv.id = $3 and cv.contact_id = ct.id
      where ct.organization_id = $1 and ct.id = $2`,
    [e.organizationId, e.contactId, e.conversationId],
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
  "setor_da_conversa",
  "etapa_do_funil",
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
      setor_id: string | null;
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
              ) as outro_chatbot,
              c.setor_id
         from conversations c
        where c.organization_id = $1 and c.id = $2`,
      [e.organizationId, e.conversationId, fluxoId],
    );
    const c = rows[0];
    if (!c) return undefined;
    const equipe = grafo.nodes.some((n) => n.type === "presenca_do_atendente")
      ? (await quemPodeAssumirAgora(pool, e.organizationId, new Date())).disponiveis > 0
      : false;
    const negocios = grafo.nodes.some((n) => n.type === "etapa_do_funil")
      ? (
          await pool.query<{ funil: string; etapa: string }>(
            `select pipeline_id::text as funil, stage_id::text as etapa
               from crm_leads
              where organization_id = $1 and contact_id = $2 and status = 'open'`,
            [e.organizationId, e.contactId],
          )
        ).rows
      : [];
    return {
      canal: c.channel_session_id,
      atendente: c.assigned_to_user_id,
      ultima_entrada_em: c.last_inbound_at,
      aguardando_resposta: c.aguardando,
      primeira_conversa: c.primeira,
      equipe_disponivel: equipe,
      outro_bot: c.ia_ativa || c.outro_chatbot,
      setor: c.setor_id,
      negocios,
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
): Promise<{
  ofertas: OfertaDeHorario[];
  extra?: { semAgendamento?: boolean; dados?: Record<string, string> };
}> {
  const no = grafo.nodes.find((n) => n.id === noId);
  if (!no) return { ofertas: [] };
  const c = lerConfig(no.type as "agendar_horario", no.data);
  // "Reagendar horário": o tipo e o responsável vêm do compromisso do contato.
  let tipo = c.event_type_id;
  let dono = c.owner_user_id;
  let extra: { semAgendamento?: boolean; dados?: Record<string, string> } | undefined;
  if (no.type === "reagendar_horario") {
    const atual = await proximoAgendamentoDoContato(admin, e);
    if (!atual) return { ofertas: [], extra: { semAgendamento: true } };
    tipo = atual.event_type_id;
    dono = atual.owner_user_id;
    extra = {
      dados: {
        [CHAVE_DO_AGENDAMENTO]: atual.id,
        agendamento_anterior: rotuloLocal(new Date(atual.starts_at), atual.time_zone),
      },
    };
  }
  if (!tipo) return { ofertas: [], ...(extra ? { extra } : {}) };
  const agora = new Date();
  try {
    const consulta = await horariosLivresDaOrg(admin, e.organizationId, {
      eventTypeId: tipo,
      ownerUserId: dono,
      de: agora,
      ate: new Date(agora.getTime() + c.dias_a_frente * 86_400_000),
      agora,
    });
    if (!consulta.ok) {
      log.info("chatbot: agenda recusou a consulta de horários", { motivo: consulta.codigo });
      return { ofertas: [], ...(extra ? { extra } : {}) };
    }
    return {
      ofertas: escolherOfertas(consulta.slots, consulta.fusoDaRegra, c.quantidade).map((s) => ({
        inicio: s.inicio.toISOString(),
        quando: rotuloLocal(s.inicio, consulta.fusoDaRegra),
      })),
      ...(extra ? { extra } : {}),
    };
  } catch (err) {
    log.warn("chatbot: consulta de horários falhou", { erro: String(err).slice(0, 160) });
    return { ofertas: [], ...(extra ? { extra } : {}) };
  }
}

/**
 * O produto do "Enviar produto" lido AGORA no Catálogo (nome, preço e
 * descrição atuais) e a primeira foto copiada para a conversa — o mesmo
 * caminho das fotos que o agente de IA manda. null = desativado ou apagado.
 */
async function produtoParaEnviar(
  pool: pg.Pool,
  e: EntradaDoChatbot,
  produtoId: string,
  log: Log,
): Promise<{ texto: string; foto: FotoParaEnvio | null } | null> {
  const { rows } = await pool.query<{
    codigo: string;
    nome: string;
    descricao: string | null;
    preco_cents: string;
    moeda: string;
  }>(
    `select codigo, nome, descricao, preco_cents::text as preco_cents, moeda
       from catalog_products
      where organization_id = $1 and id = $2 and ativo`,
    [e.organizationId, produtoId],
  );
  const p = rows[0];
  if (!p) return null;
  const preco = formatCents(Number(p.preco_cents), p.moeda);
  const texto = [`*${p.nome}*`, preco, p.descricao?.trim() ?? ""].filter(Boolean).join("\n");
  const fotos = await prepararFotosDoProduto(pool, copiarFotoNoStorage(log), {
    tenantId: e.organizationId,
    conversationId: e.conversationId,
    codigo: p.codigo,
  });
  return { texto, foto: fotos.ok ? (fotos.fotos[0] ?? null) : null };
}

type CompromissoDoContato = {
  id: string;
  event_type_id: string | null;
  owner_user_id: string | null;
  starts_at: string;
  time_zone: string;
};

/**
 * O próximo compromisso do contato (pendente ou confirmado, ainda por vir) —
 * o alvo do "Reagendar horário" e do "Cancelar agendamento". Filtra a
 * organização: o admin ignora a RLS.
 */
async function proximoAgendamentoDoContato(
  admin: SupabaseClient,
  e: EntradaDoChatbot,
): Promise<CompromissoDoContato | null> {
  const { data } = await admin
    .from("calendar_appointments")
    .select("id, event_type_id, owner_user_id, starts_at, time_zone")
    .eq("organization_id", e.organizationId)
    .eq("contact_id", e.contactId)
    .in("status", ["pending", "confirmed"])
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as CompromissoDoContato | null) ?? null;
}

/** "Cancelar agendamento" pelo MESMO handler da tela (audita, avisa a agenda conectada). */
async function cancelarProximoAgendamento(
  admin: SupabaseClient,
  e: EntradaDoChatbot,
  fluxoId: string,
  grafo: Grafo,
  noId: string,
  log: Log,
): Promise<{ desfecho: "cancelado" | "sem_agendamento" | "falha"; quando: string | null }> {
  const no = grafo.nodes.find((n) => n.id === noId);
  const c = lerConfig("cancelar_agendamento", no?.data);
  try {
    const atual = await proximoAgendamentoDoContato(admin, e);
    if (!atual) return { desfecho: "sem_agendamento", quando: null };
    const quando = rotuloLocal(new Date(atual.starts_at), atual.time_zone);
    await cancelarAgendamentoHandler(
      admin,
      {
        organization_id: e.organizationId,
        actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
        requestId: `chatbot:${fluxoId}:cancelar:${atual.id}`,
      },
      { id: atual.id, reason: c.motivo || "Cancelado pelo contato no WhatsApp" },
    );
    log.info("chatbot: compromisso cancelado", { flow_id: fluxoId });
    return { desfecho: "cancelado", quando };
  } catch (err) {
    log.warn("chatbot: cancelamento falhou", {
      flow_id: fluxoId,
      codigo: err instanceof ApiError ? err.code : String(err).slice(0, 120),
    });
    return { desfecho: "falha", quando: null };
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
  if (no?.type === "reagendar_horario") {
    if (!pendente.agendamento_id) return { ok: false, ocupado: false };
    try {
      const r = await alterarAgendamentoHandler(
        admin,
        {
          organization_id: e.organizationId,
          actor: { type: "webhook_source", id: `chatbot:${fluxoId}` },
          requestId: `chatbot:${fluxoId}:${sessaoId}`,
        },
        { id: pendente.agendamento_id, starts_at: pendente.inicio },
      );
      log.info("chatbot: horário remarcado", { flow_id: fluxoId });
      return { ok: true, aguardaConfirmacao: r.status === "pending" };
    } catch (err) {
      if (err instanceof ApiError) {
        log.info("chatbot: a agenda recusou a remarcação", { flow_id: fluxoId, codigo: err.code });
        return { ok: false, ocupado: err.code === "agenda_horario_indisponivel" };
      }
      log.warn("chatbot: remarcação falhou", { flow_id: fluxoId, erro: String(err).slice(0, 160) });
      return { ok: false, ocupado: false };
    }
  }
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
  const segredos = await decifrarSegredosDoPasso(admin, c, {
    organizationId: e.organizationId,
    flowId: fluxoId,
    nodeId: no.id,
  });
  // Segredo gravado que não abre (cifra indisponível, ou sem o lacre deste
  // passo — inclusive o gravado antes do lacre): não chama sem ele (sairia sem
  // assinatura ou sem autorização) — segue por "Falhou", e a equipe lê o porquê.
  if ((c.segredo_enc && !segredos.segredo) || (c.autorizacao_enc && !segredos.autorizacao)) {
    log.warn("chatbot: segredo do WebHook não pôde ser aberto — chamada não feita", {
      flow_id: fluxoId,
    });
    await notaDoChatbot(
      pool,
      e,
      fluxoId,
      `chatbot:${fluxoId}:${e.inboundMessageId ?? e.referencia ?? no.id}:segredo`,
      "O WebHook do chatbot não foi chamado: o segredo ou a autorização do passo precisa ser digitado de novo (abra o passo WebHook, digite e salve).",
    ).catch(() => undefined);
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
      variaveisDaEmpresa: ctx.empresa,
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
  await somarEstatistica(pool, e.organizationId, fluxoId, resultado.caminho ?? [], log);

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
 * Estatística por bloco (migration 0512): cada bloco concluído no turno soma 1
 * na saída por onde seguiu, no dia da empresa. Falha aqui nunca atrapalha o
 * atendimento — é contagem, não efeito.
 */
async function somarEstatistica(
  pool: pg.Pool,
  organizationId: string,
  fluxoId: string,
  caminho: { no: string; saida: string }[],
  log: Log,
): Promise<void> {
  if (caminho.length === 0) return;
  const contas = new Map<string, { no: string; saida: string; n: number }>();
  for (const p of caminho) {
    const no = p.no.slice(0, 100);
    const saida = (p.saida || "proximo").slice(0, 60);
    const k = `${no}\u0000${saida}`;
    const atual = contas.get(k);
    if (atual) atual.n += 1;
    else contas.set(k, { no, saida, n: 1 });
  }
  const linhas = [...contas.values()];
  try {
    await pool.query(
      `insert into chatbot_estatisticas (organization_id, flow_id, node_id, saida, dia, contagem)
       select $1, $2, x.no, x.saida,
              (now() at time zone coalesce((select timezone from organizations where id = $1), 'America/Sao_Paulo'))::date,
              x.n
         from unnest($3::text[], $4::text[], $5::int[]) as x(no, saida, n)
       on conflict (organization_id, flow_id, node_id, saida, dia)
       do update set contagem = chatbot_estatisticas.contagem + excluded.contagem`,
      [organizationId, fluxoId, linhas.map((l) => l.no), linhas.map((l) => l.saida), linhas.map((l) => l.n)],
    );
  } catch (err) {
    log.warn("chatbot: não deu para somar a estatística do bloco", {
      flow_id: fluxoId,
      erro: (err as Error).message.slice(0, 120),
    });
  }
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

/**
 * A sessão para no relógio: espera do fluxo, mensagem de espera de uma
 * transferência, ou o prazo de uma pergunta ("Não respondeu a tempo"). A
 * resposta que chega antes regrava a sessão com outro token (ou sem), e o
 * relógio antigo é descartado ao acordar — não há corrida.
 */
function temRelogio(s: SessaoDoChatbot): boolean {
  return (
    Boolean(s.retomar_em) &&
    (s.status === "waiting_timer" || s.status === "transferred" || s.status === "waiting_input")
  );
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
  /** "Acionar outro fluxo" em paralelo: começa sem encerrar o que já roda. */
  paralelo?: boolean;
  /** Quantos paralelos encadeados já houve (trava de laço). */
  paralelos?: number;
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
      : pedido.paralelo
        ? inicioParaAcionar(g.data)
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
    tags_da_conversa: string[] | null;
    variaveis_da_empresa: unknown;
  }>(
    `select c.assignee_kind, ct.is_blocked, o.timezone, o.settings->'variaveis' as variaveis_da_empresa,
            ct.tags, coalesce(ct.name, ct.display_name) as nome, ct.email,
            ct.birthdate::text as aniversario, ct.custom_fields, c.tags as tags_da_conversa
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

  const acesso = await acessoPeloPlanoDaOrganizacao(organizationId, pool);
  if (!acesso.liberado) return "descartado";

  const abre = await adiarAteAJanelaAbrir(admin, organizationId, pedido.channel_session_id);
  if (abre) return { adiarAte: abre };

  // Em PARALELO nada disto: o fluxo que chamou continua de onde está.
  if (!pedido.paralelo) {
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
  }

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
      : pedido.paralelo
        ? `paralelo:${pedido.flow_id}`
        : `regra:${pedido.regra_id ?? "?"}`,
    paralelos: pedido.paralelos ?? 0,
  };
  const ctx: ContextoDoTurno = {
    mensagem: null,
    agora: new Date(),
    fuso: conversa.timezone || "America/Sao_Paulo",
    contato: contatoDoTurno(conversa),
    empresa: variaveisDoTurno(conversa.variaveis_da_empresa),
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
      variaveis_da_empresa: unknown;
      ended_at: string | null;
      started_at: string;
    }
  >(
    `select s.id, s.flow_id, s.status, s.no_atual, s.tentativas, s.collected_data, s.retomar_em,
            s.ended_at::text as ended_at, s.started_at::text as started_at,
            f.grafo, f.is_active, o.timezone, o.settings->'variaveis' as variaveis_da_empresa
       from chatbot_sessions s
       join chatbot_flows f on f.id = s.flow_id and f.organization_id = s.organization_id
       join organizations o on o.id = s.organization_id
      where s.organization_id = $1 and s.id = $2
        and s.status in ('waiting_timer', 'transferred', 'waiting_input')
        and s.retomada_token = $3::uuid`,
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
    tags_da_conversa: string[] | null;
  }>(
    `select c.assignee_kind, ct.is_blocked,
            ct.tags, coalesce(ct.name, ct.display_name) as nome, ct.email,
            ct.birthdate::text as aniversario, ct.custom_fields, c.tags as tags_da_conversa
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

  const acesso = await acessoPeloPlanoDaOrganizacao(organizationId, pool);
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
    empresa: variaveisDoTurno(sessao.variaveis_da_empresa),
    conversa: await lerFatosDaConversa(pool, e, sessao.flow_id, g.data),
  };
  const resultado = retomarFluxo(
    g.data,
    {
      no_atual: sessao.no_atual,
      // Pergunta com prazo vencido segue por "Não respondeu a tempo".
      status: sessao.status === "waiting_input" ? "waiting_input" : "waiting_timer",
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

  const acesso = await acessoPeloPlanoDaOrganizacao(organizationId, pool);
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
           entregue_a = case when $9::uuid is null then null else chatbot_sessions.entregue_a end,
           entregue_em = case when $9::uuid is null then null else chatbot_sessions.entregue_em end,
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
      // As variáveis da empresa valem só no turno: gravadas, um valor trocado
      // em Configurações não chegaria às sessões que já estavam esperando.
      JSON.stringify(semVariaveisDaEmpresa(s.dados)),
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
  const notaInterna = (texto: string) => notaDoChatbot(pool, e, fluxoId, requestId, texto);
  // Fila humana: a IA fica calada nesta conversa e a Distribuição de
  // atendimento escolhe quem pega. Só o humano devolve ao robô.
  const paraAFilaDaEquipe = () =>
    pool.query(
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
  const envio = await prepararEnvio(pool, admin, e, fluxoId, requestId, log);
  const boundary = envio.boundary;
  const enviar = async (corpo: Record<string, unknown>) => {
    await envio.enviar(corpo);
  };

  for (const efeito of efeitos) {
    try {
      switch (efeito.tipo) {
        case "enviar":
          await enviar({
            type: "text",
            body: efeito.texto,
            ...(efeito.escolhas ? { metadata: { escolhas: efeito.escolhas } } : {}),
          });
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
        case "contato":
          // O mesmo cartão de contato da Inbox: o handler monta o vCard.
          await enviar({
            type: "contact",
            metadata: { shared_contact: { name: efeito.nome, phone_number: efeito.telefone } },
          });
          break;
        case "produto": {
          const p = await produtoParaEnviar(pool, e, efeito.produto_id, log);
          if (!p) {
            await notaInterna(
              "O chatbot ia mandar um produto do Catálogo, mas ele está desativado ou foi apagado.",
            );
            break;
          }
          const legenda = [efeito.mensagem, p.texto].filter(Boolean).join("\n\n");
          if (p.foto) {
            await enviar({
              type: "image",
              media_storage_path: p.foto.storagePath,
              media_mime: p.foto.mime,
              body: legenda.slice(0, LIMITE_DA_LEGENDA),
            });
          } else {
            await enviar({ type: "text", body: legenda });
          }
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
          if (efeito.alvo === "conversa") {
            await editarEtiquetasDaConversa(pool, e, efeito, fluxoId, requestId, log);
            break;
          }
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
          if (efeito.setor_da_conversa && !efeito.setor_id) {
            // "Setor da conversa anterior": o setor em que a conversa já estava.
            const { rows } = await pool.query<{ setor_id: string | null }>(
              `select setor_id from conversations where organization_id = $1 and id = $2`,
              [e.organizationId, e.conversationId],
            );
            efeito.setor_id = rows[0]?.setor_id ?? null;
          }
          if (efeito.setor_id) {
            // Fila do setor: a mesma sequência da rota da Inbox (IA calada,
            // dono de fora do setor solta, distribuição só entre membros).
            const r = await transferirParaSetor(admin, {
              organizationId: e.organizationId,
              conversationId: e.conversationId,
              setorId: efeito.setor_id,
            }).catch((err: unknown) => {
              log.warn("chatbot: transferência para o setor falhou — transferido para a equipe toda", {
                flow_id: fluxoId,
                erro: (err as Error).message.slice(0, 120),
              });
              return null;
            });
            if (r && !r.ok) {
              log.warn("chatbot: setor do passo não existe mais — transferido para a equipe toda", {
                flow_id: fluxoId,
              });
            } else if (r?.ok) {
              void audit({
                action: "conversation.setor_changed",
                actorUserId: null,
                organizationId: e.organizationId,
                resourceType: "conversation",
                resourceId: e.conversationId,
                requestId,
                bypassedRls: true,
                metadata: {
                  conversation_id: e.conversationId,
                  setor_id: efeito.setor_id,
                  prev: r.setorAnterior,
                  soltou_dono: r.soltouDono,
                  source: "chatbot",
                  flow_id: fluxoId,
                },
              });
              await marcarEntrega(pool, e.organizationId, sessao.id, "equipe");
              break;
            }
          }
          await paraAFilaDaEquipe();
          await marcarEntrega(pool, e.organizationId, sessao.id, "equipe");
          break;
        }
        case "transferir_atendente": {
          const quem = await atendenteDoPasso(pool, admin, e, efeito, log);
          if (!quem) {
            // Ninguém para receber: a conversa não fica sem dono nem com o
            // robô — vai para a fila humana, e a equipe lê o porquê.
            await notaInterna(notaSemAtendente(efeito.modo));
            await paraAFilaDaEquipe();
            await marcarEntrega(pool, e.organizationId, sessao.id, "equipe");
            break;
          }
          const { error } = await admin.rpc("fn_conversation_assign", {
            p_organization_id: e.organizationId,
            p_conversation_id: e.conversationId,
            p_to_user_id: quem,
            p_reason: "transfer",
            p_enforce_expected: false,
          });
          if (error) {
            log.warn("chatbot: transferência para atendente falhou — conversa na fila", {
              flow_id: fluxoId,
              modo: efeito.modo,
              erro: error.message.slice(0, 120),
            });
            await paraAFilaDaEquipe();
            await marcarEntrega(pool, e.organizationId, sessao.id, "equipe");
          } else {
            await marcarEntrega(pool, e.organizationId, sessao.id, "atendente");
          }
          break;
        }
        case "remover_atendente": {
          // "Remover": a conversa fica sem dono e o chatbot continua com ela.
          const { error } = await admin.rpc("fn_conversation_assign", {
            p_organization_id: e.organizationId,
            p_conversation_id: e.conversationId,
            p_to_user_id: null as unknown as string,
            p_reason: "release",
            p_enforce_expected: false,
          });
          if (error)
            log.warn("chatbot: não deu para remover o atendente", {
              flow_id: fluxoId,
              erro: error.message.slice(0, 120),
            });
          else await notaInterna("O chatbot tirou o atendente desta conversa.");
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
            origem: "chatbot",
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
            // Toda recusa vira nota: sem ela, a equipe não sabe que o contato
            // ficou de fora (e o painel do passo promete esta nota).
            if (r.code === "conflict")
              await notaInterna(
                `O chatbot tentou o follow-up "${nomeDoFollowup}", mas o contato já está em outro follow-up ativo.`,
              );
            else if (r.code === "flow_not_active")
              await notaInterna(
                `O chatbot tentou o follow-up "${nomeDoFollowup}", mas ele não está publicado. Publique em IA › Follow-ups.`,
              );
            else
              await notaInterna(
                // Erro de banco fica no log; a nota diz só que falhou.
                `O chatbot não conseguiu pôr o contato no follow-up "${nomeDoFollowup}"${r.code === "internal_error" ? "" : ` (${r.message})`}.`,
              );
          }
          break;
        }
        case "notificar": {
          // Atendentes escolhidos: aviso no celular de cada um (e nota na
          // conversa com os nomes). Ninguém alcançável → cai na Central, para a
          // conversa não ficar sem ninguém olhando.
          if (efeito.atendentes && efeito.atendentes.length > 0) {
            const { rows: alvo } = await pool.query<{ user_id: string; nome: string | null }>(
              `select uo.user_id,
                      coalesce(u.raw_user_meta_data->>'full_name', u.email) as nome
                 from user_organizations uo
                 join auth.users u on u.id = uo.user_id
                 left join attendant_availability aa
                   on aa.organization_id = uo.organization_id and aa.user_id = uo.user_id
                where uo.organization_id = $1 and uo.revoked_at is null
                  and uo.role in ('agent', 'manager', 'admin')
                  and uo.user_id = any($2::uuid[])
                  and ($3 = false or coalesce(aa.is_available, false))`,
              [e.organizationId, efeito.atendentes, efeito.so_disponiveis === true],
            );
            if (alvo.length > 0) {
              const nomes = alvo.map((a) => a.nome ?? "atendente").join(", ");
              await notaInterna(`Aviso do chatbot para ${nomes}${efeito.texto ? `: ${efeito.texto}` : "."}`);
              for (const a of alvo)
                await enviarPushAoUsuario(e.organizationId, a.user_id, {
                  title: (efeito.modelo || "O chatbot pediu atenção nesta conversa").slice(0, 200),
                  body: "O chatbot pediu que você olhe esta conversa.",
                  tag: `chatbot:${e.conversationId}`,
                  href: `/app/inbox?id=${e.conversationId}`,
                }).catch((err: unknown) =>
                  log.warn("chatbot: aviso no celular falhou", { erro: (err as Error).message.slice(0, 120) }),
                );
              break;
            }
            await notaInterna(
              efeito.so_disponiveis
                ? "Nenhum dos atendentes escolhidos estava disponível: o aviso do chatbot foi para a Central de avisos."
                : "Nenhum dos atendentes escolhidos faz mais parte da equipe: o aviso do chatbot foi para a Central de avisos.",
            );
          }
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
        case "visibilidade": {
          // A conversa oculta sai da caixa de entrada (lib/inbox/visibilidade.ts);
          // "até a próxima mensagem" o gatilho do banco desfaz sozinho.
          const { rows } = await pool.query<{ antes: string }>(
            `update conversations c set visibilidade = $3, updated_at = now()
               from (select visibilidade as antes from conversations
                      where organization_id = $1 and id = $2) a
              where c.organization_id = $1 and c.id = $2 and c.visibilidade is distinct from $3
              returning a.antes`,
            [e.organizationId, e.conversationId, efeito.visibilidade],
          );
          if (rows.length === 0) break;
          void audit({
            action: "conversation.visibility_changed",
            actorUserId: null,
            organizationId: e.organizationId,
            resourceType: "conversation",
            resourceId: e.conversationId,
            requestId,
            bypassedRls: true,
            metadata: {
              conversation_id: e.conversationId,
              visibilidade: efeito.visibilidade,
              prev: rows[0]?.antes ?? null,
              source: "chatbot",
              flow_id: fluxoId,
            },
          });
          break;
        }
        case "privacidade": {
          // Quem garante a privacidade é a RLS (fn_can_view_conversation de 3
          // argumentos); aqui só a marca muda, auditada e com nota para a equipe.
          const { rows } = await pool.query<{ antes: boolean }>(
            `update conversations c set is_private = $3, updated_at = now()
               from (select is_private as antes from conversations
                      where organization_id = $1 and id = $2) a
              where c.organization_id = $1 and c.id = $2 and c.is_private is distinct from $3
              returning a.antes`,
            [e.organizationId, e.conversationId, efeito.privada],
          );
          if (rows.length === 0) break;
          void audit({
            action: "conversation.privacy_changed",
            actorUserId: null,
            organizationId: e.organizationId,
            resourceType: "conversation",
            resourceId: e.conversationId,
            requestId,
            bypassedRls: true,
            metadata: {
              conversation_id: e.conversationId,
              is_private: efeito.privada,
              prev: rows[0]?.antes ?? null,
              source: "chatbot",
              flow_id: fluxoId,
            },
          });
          await notaInterna(
            efeito.privada
              ? "O chatbot tornou esta conversa privada: só o responsável e os gestores a veem."
              : "O chatbot liberou esta conversa: ela volta a seguir a visibilidade da empresa.",
          );
          break;
        }
        case "fluxo_de_espera": {
          if (!efeito.ligar) {
            // Desarma as mensagens de espera das transferências desta conversa:
            // sem `retomada_token`, o evento já agendado chega e é descartado.
            const { rowCount } = await pool.query(
              `update chatbot_sessions
                  set retomar_em = null, retomada_token = null, updated_at = now()
                where organization_id = $1 and conversation_id = $2
                  and status = 'transferred' and retomar_em is not null`,
              [e.organizationId, e.conversationId],
            );
            if (rowCount)
              await notaInterna("O chatbot desligou as mensagens de espera desta conversa.");
            break;
          }
          // Liga de novo: a última transferência desta conversa com espera
          // configurada e vezes sobrando volta a ter relógio.
          const { rows } = await pool.query<{
            id: string;
            flow_id: string;
            no_atual: string | null;
            tentativas: number | null;
            grafo: unknown;
          }>(
            `select s.id, s.flow_id, s.no_atual, s.tentativas, f.grafo
               from chatbot_sessions s
               join chatbot_flows f on f.id = s.flow_id and f.organization_id = s.organization_id
              where s.organization_id = $1 and s.conversation_id = $2
                and s.status = 'transferred' and s.retomar_em is null and s.no_atual is not null
              order by s.updated_at desc
              limit 1`,
            [e.organizationId, e.conversationId],
          );
          const alvo = rows[0];
          const g = alvo ? grafoSchema.safeParse(alvo.grafo) : null;
          const quando =
            alvo && g?.success
              ? relogioDaEspera(g.data, alvo.no_atual, alvo.tentativas ?? 0, new Date())
              : null;
          if (!alvo || !quando) break;
          const token = randomUUID();
          await pool.query(
            `update chatbot_sessions set retomar_em = $3, retomada_token = $4, updated_at = now()
              where organization_id = $1 and id = $2`,
            [e.organizationId, alvo.id, quando, token],
          );
          await agendarRetomada(pool, e, alvo.flow_id, alvo.id, token, quando);
          await notaInterna("O chatbot ligou de novo as mensagens de espera desta conversa.");
          break;
        }
        case "fluxo_paralelo": {
          // Bot paralelo: o outro fluxo começa por um pedido próprio no
          // barramento (o mesmo da automação), e este segue. Travas: não abre
          // a si mesmo (as duas rodadas dividiriam a mesma sessão) e não
          // encadeia sem fim.
          const encadeados = (e.paralelos ?? 0) + 1;
          if (efeito.flow_id === fluxoId || encadeados > PARALELOS_ENCADEADOS_MAX || !e.channelSessionId || !boundary) {
            await notaInterna(
              efeito.flow_id === fluxoId
                ? "O chatbot não abriu o fluxo em paralelo: um fluxo não pode abrir a si mesmo em paralelo."
                : encadeados > PARALELOS_ENCADEADOS_MAX
                  ? "O chatbot não abriu mais um fluxo em paralelo: já havia fluxos demais abrindo um ao outro."
                  : "O chatbot não abriu o fluxo em paralelo: a conversa não tem número ou atendimento.",
            );
            break;
          }
          const { error } = await admin.rpc("emit_event", {
            p_event_type: "chatbot.inicio_requested",
            p_entity_kind: "contact",
            p_entity_id: e.contactId,
            p_payload: {
              flow_id: efeito.flow_id,
              contact_id: e.contactId,
              conversation_id: e.conversationId,
              channel_session_id: e.channelSessionId,
              boundary,
              variaveis: {},
              regra_id: null,
              paralelo: true,
              paralelos: encadeados,
            },
            p_metadata: { source: "chatbot", flow_id: fluxoId, request_id: requestId },
            p_organization_id: e.organizationId,
          });
          if (error) log.warn("chatbot: pedido de fluxo em paralelo falhou", { erro: error.message.slice(0, 120) });
          break;
        }
        case "finalizar": {
          const { rows } = await pool.query<{ service_revision: number; responsavel: string | null; nome: string | null }>(
            `select c.service_revision::float8 as service_revision,
                    uo.user_id as responsavel,
                    nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '') as nome
               from conversations c
               -- Só conta como responsável quem AINDA é da equipe desta empresa.
               left join user_organizations uo
                 on uo.organization_id = c.organization_id and uo.user_id = c.assigned_to_user_id and uo.revoked_at is null
               left join auth.users u on u.id = uo.user_id
              where c.organization_id = $1 and c.id = $2`,
            [e.organizationId, e.conversationId],
          );
          const { error } = await admin.rpc("fn_service_status", {
            p_org: e.organizationId,
            p_conversation: e.conversationId,
            p_status: "closed",
            p_expected: rows[0]?.service_revision,
          });
          if (error) {
            log.warn("chatbot: finalizar conversa falhou", { erro: error.message.slice(0, 120) });
            break;
          }
          // Quem fechou: o chatbot, ou — se o passo pediu e a conversa tem
          // responsável — o atendente. Fica no registro de auditoria (ator) e
          // numa nota que a equipe lê na conversa.
          const emNomeDe = efeito.quem === "responsavel" ? (rows[0]?.responsavel ?? null) : null;
          void audit({
            action: "conversation.closed",
            actorUserId: emNomeDe,
            organizationId: e.organizationId,
            resourceType: "conversation",
            resourceId: e.conversationId,
            requestId,
            bypassedRls: true,
            metadata: { source: "chatbot", flow_id: fluxoId, fechada_por: emNomeDe ? "responsavel" : "chatbot" },
          });
          await notaInterna(
            emNomeDe
              ? `Conversa fechada pelo chatbot em nome de ${rows[0]?.nome ?? "quem estava atendendo"}.`
              : "Conversa fechada pelo chatbot.",
          );
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
