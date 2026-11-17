/**
 * O PISO OCIOSO DO CRON (#3731, parte 1) — a saída antecipada que NÃO custa
 * requisição ao Supabase.
 *
 * ─── O defeito ──────────────────────────────────────────────────────────────
 *
 * Numa instalação ociosa, o `event_log` e ~13,9 chamadas/min do crontab
 * (`docker/scheduler/entrypoint.sh`) sustentam ~44 req/min enquanto ninguém usa
 * o produto. Boa parte delas é de recurso que a organização NÃO TEM LIGADO:
 * prospecção sem campanha, campanhas sem campanha, importação de histórico sem
 * importação e Google Agenda sem conexão nem compromisso a empurrar — e, desde o
 * #3694 (crédito: @webtecnica), replay de webhook sem linha transitória,
 * follow-up sem inscrição vencida, pointer ou turno na fila, agendador de pausa
 * sem janela começada e proposta sem envio em curso. Cada uma dessas rotas ia
 * ao PostgREST
 * a cada minuto só para descobrir que a fila está vazia — e no plano grátis do
 * Supabase isso consome o projeto até o `PGRST002` derrubar a instalação.
 *
 * ─── O SINAL: um RETRATO em memória, alimentado por UMA consulta por janela ──
 *
 * O portão lê, de uma vez só, um `exists` por recurso e guarda o
 * resultado num mapa de PROCESSO com validade de `TTL_DO_RETRATO_MS` (30 s).
 *
 * Por que ele não custa requisição:
 *
 * - **Não é PostgREST.** A consulta vai pelo pool `pg` direto (`getRequestPool`),
 *   então não gasta a cota de requisições do PostgREST — é justamente a cota que
 *   o `PGRST002` estoura.
 * - **Uma por janela, não uma por rota.** Todas as rotas que consultam o portão
 *   dividem o MESMO retrato: ~60 consultas/h para a instalação inteira (uma
 *   por minuto, porque o crond dispara tudo no segundo 0 e o retrato de 30 s
 *   vence antes da batida seguinte), contra 60/h POR ROTA que cada uma fazia
 *   antes. Dentro da mesma batida, a resposta é do mapa.
 * - **Uma consulta, todos os recursos.** As perguntas cabem num `select`
 *   só; consultas separadas seriam o mesmo custo multiplicado.
 *
 * O que NÃO se perde: a 1ª batida depois de ligar um recurso já roda. Um TTL
 * de minutos economizaria mais e quebraria a promessa da tela da campanha
 * ("Envio rápido: sai tudo em cerca de {n} min.") — com 5 min, a campanha
 * recém-ligada esperava quatro batidas paradas. 30 s dá uma leitura por
 * minuto com folga; 55 s deixaria só ~5 s entre a batida e o vencimento.
 *
 * ─── A REGRA DE FALHA: na dúvida, RODA ──────────────────────────────────────
 *
 * Erro de leitura (tabela ausente numa instalação antiga, banco fora, pool sem
 * `SUPABASE_DB_URL`) = `true`, ou seja, a rota segue o caminho normal. Este
 * portão existe para economizar cota, não para decidir se um recurso funciona:
 * um "não sei" que virasse "desligado" apagaria a prospecção de quem tem
 * campanha rodando, e o sintoma apareceria dias depois, sem log de erro.
 * O retrato com falha também fica em cache pela mesma janela — senão a leitura
 * quebrada voltaria a ser uma consulta por minuto, que é o que este arquivo
 * veio remover.
 *
 * ─── QUEM CRIA TRABALHO NO PROCESSO AVISA (`invalidarRetrato`) ──────────────
 *
 * Para o que nasce fora deste processo (gatilho no banco, `agent-worker` em
 * outro contêiner), o atraso é o TTL — no máximo uma batida. Para o que nasce
 * aqui, não: quem cria trabalho no mesmo processo chama `invalidarRetrato()`,
 * e a batida seguinte relê.
 */
import type pg from "pg";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { logger } from "@/lib/logger";

/** Os recursos cujo cron pode ficar ocioso sem que a organização perca nada. */
export const RECURSOS_DO_CRON = [
  "historico",
  "agenda_google",
  "agenda_google_push",
  "webhook_replay",
  "propostas",
  "fila_de_soneca",
  "mensagem_presa",
  "ligacao_presa",
  "redacao_de_storage",
  "devolucao_de_handoff",
  "canal_vigiado",
  "lembrete_de_agenda",
  "roteamento",
] as const;
export type RecursoDoCron = (typeof RECURSOS_DO_CRON)[number];

/**
 * Validade do retrato. 30 s = ~60 consultas/h para a instalação inteira (uma
 * por batida do crond), contra 60/h POR ROTA antes. Mais que um minuto faria a
 * batida seguinte a ligar um recurso pular — e a campanha recém-ligada ficar
 * parada; a economia vem de as rotas dividirem o retrato e de ele ir pelo
 * pool `pg`, não de o TTL ser longo.
 */
export const TTL_DO_RETRATO_MS = 30_000;

/**
 * Teto da consulta do retrato. Um banco que aceita conexão e não responde não
 * pode segurar um cron de minuto a minuto: passado o teto, vale a regra de falha
 * (roda) e o resultado fica em cache como qualquer outro.
 */
const TETO_DA_LEITURA_MS = 2_000;

/**
 * UMA consulta, um `exists` por recurso. Cada predicado é um SUPERCONJUNTO do
 * trabalho que a rota daquele recurso faria: se ele diz "não", a rota não teria
 * o que fazer; se diz "sim" à toa, a rota só roda como antes. Fork ChatAI
 * Online: só os recursos cujo cron existe aqui (o produto original tem mais).
 * A consulta é exercitada contra o `baseline.sql` em
 * `tests/invariants/piso-ocioso-do-fork.test.ts` — uma tabela ou coluna que
 * falte faria a leitura falhar e, pela regra de falha, tudo voltaria a rodar
 * sem ninguém ver.
 */
const SQL_DO_RETRATO = `
select
  (
    exists (
      select 1 from importacoes_de_historico where status in ('rodando', 'aguardando')
    )
    or exists (
      select 1 from event_log
       where event_type = 'channel_session.status_changed'
         and payload ->> 'from_status' = 'WORKING'
         and created_at > now() - interval '8 days'
    )
    or exists (
      select 1 from agent_inbox_items
       where status = 'open'
         and kind in ('recuperacao_da_queda', 'cliente_sem_resposta_na_queda')
    )
  ) as historico,
  exists (
    select 1 from calendar_connections
     where status in ('healthy', 'rate_limited') and provider = 'google_calendar'
  ) as agenda_google,
  exists (
    select 1 from calendar_appointments
     where needs_google_push
        or (google_event_id is not null and google_conflict is null)
        or google_conflict -> 'resolution' is not null
  ) as agenda_google_push,
  exists (
    select 1 from webhook_events_log
     where status = 'error' and error_message like 'transitoria:%'
  ) as webhook_replay,
  exists (
    select 1 from crm_proposals where status = 'enviando'
  ) as propostas,
  exists (
    select 1 from conversations
     where snooze_until is not null and snooze_until <= now()
  ) as fila_de_soneca,
  exists (
    select 1 from messages
     where direction = 'outbound' and status = 'sending'
       and created_at < now() - interval '3 minutes'
  ) as mensagem_presa,
  exists (
    select 1 from voice_calls
     where status in ('starting', 'ringing')
       and created_at < now() - interval '3 minutes'
  ) as ligacao_presa,
  exists (
    select 1 from storage_redaction_queue where status = 'pending'
  ) as redacao_de_storage,
  exists (
    select 1 from conversations
     where is_group = false
       and status in ('open', 'pending', 'claimed', 'ai_handling')
       and (bot_silenced_until is not null or assignee_kind = 'user' or assigned_to_user_id is not null)
  ) as devolucao_de_handoff,
  exists (
    select 1 from channel_sessions where archived_at is null
  ) as canal_vigiado,
  exists (
    select 1 from calendar_appointments
     where status = 'confirmed' and contact_id is not null
       and starts_at > now() and starts_at <= now() + interval '30 days'
  ) as lembrete_de_agenda,
  exists (
    select 1 from event_log
     where event_type = 'conversation.routing_requested'
       and (
         (status = 'pending' and (next_attempt_at is null or next_attempt_at <= now()))
         or (status = 'processing' and updated_at <= now() - interval '5 minutes')
       )
  ) as roteamento
`;

type Retrato = { emUso: Record<RecursoDoCron, boolean>; ate: number };

let retrato: Retrato | null = null;
/**
 * A leitura em andamento. Sem ela, os crons que batem na mesma janela
 * (o crontab dispara vários no mesmo segundo) começariam uma leitura cada, em
 * paralelo — o retrato só existe depois do primeiro `await`, então todos veem
 * "vazio". Uma promessa dividida mantém a promessa do arquivo: uma leitura por
 * janela, não uma por rota.
 */
let carregando: Promise<Record<RecursoDoCron, boolean>> | null = null;
/**
 * Conta as invalidações. A leitura que já estava em voo quando alguém
 * invalidou NÃO pode gravar o retrato de antes do evento — seria devolver 30 s
 * de "nada a fazer" para o trabalho que acabou de nascer.
 */
let geracao = 0;

/** O banco do portão. Só `query` é usado — o pool inteiro não entra aqui. */
export type BancoDoPortao = Pick<pg.Pool, "query">;

function retratoCompleto(linha: Record<string, unknown> | undefined): Record<RecursoDoCron, boolean> {
  return Object.fromEntries(RECURSOS_DO_CRON.map((r) => [r, linha?.[r] === true])) as Record<RecursoDoCron, boolean>;
}

/** O retrato de "tudo em uso" — o lado seguro, usado quando a leitura falha. */
const TUDO_EM_USO = Object.fromEntries(RECURSOS_DO_CRON.map((r) => [r, true])) as Record<RecursoDoCron, boolean>;

function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const relogio = setTimeout(() => reject(new Error(`leitura do retrato passou de ${ms} ms`)), ms);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(relogio);
        reject(erro);
      },
    );
  });
}

async function lerRetrato(db?: BancoDoPortao): Promise<Record<RecursoDoCron, boolean>> {
  try {
    const banco = db ?? getRequestPool();
    const { rows } = await comTeto(
      Promise.resolve(banco.query(SQL_DO_RETRATO)) as Promise<{ rows: unknown[] }>,
      TETO_DA_LEITURA_MS,
    );
    return retratoCompleto(rows[0] as Record<string, unknown> | undefined);
  } catch (erro) {
    // Falha fechada ao contrário: "não sei" vira "tem trabalho" e a rota segue.
    logger.warn("piso ocioso do cron: leitura do retrato falhou — as rotas seguem o caminho normal", {
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return TUDO_EM_USO;
  }
}

/**
 * `true` = o recurso tem trabalho nesta instalação, a rota deve rodar.
 * `false` = fila vazia, a rota pode sair ANTES de qualquer outra ida ao banco.
 *
 * `agora` e `db` são pontos de injeção do teste (`lib/cron/piso-ocioso.test.ts`);
 * nenhuma rota os passa.
 */
export async function recursoTemTrabalho(
  recurso: RecursoDoCron,
  agora: number = Date.now(),
  db?: BancoDoPortao,
): Promise<boolean> {
  if (retrato !== null && retrato.ate > agora) return retrato.emUso[recurso];
  const minhaGeracao = geracao;
  carregando ??= lerRetrato(db);
  const emUso = await carregando;
  // Só grava se ninguém invalidou no meio do caminho (ver `geracao`).
  if (geracao === minhaGeracao) {
    carregando = null;
    retrato = { emUso, ate: agora + TTL_DO_RETRATO_MS };
  }
  return emUso[recurso];
}

/**
 * O atalho que as rotas chamam: `true` = pode sair.
 *
 * Existe para a rota não repetir `!(await recursoTemTrabalho(...))` — a negação
 * dupla é o tipo de detalhe que alguém "conserta" ao revisar e transforma a
 * saída antecipada em `return` prematuro do caminho normal.
 */
export async function recursoOcioso(
  recurso: RecursoDoCron,
  agora: number = Date.now(),
  db?: BancoDoPortao,
): Promise<boolean> {
  return !(await recursoTemTrabalho(recurso, agora, db));
}

/**
 * Esquece o retrato: a próxima batida relê. Quem cria trabalho DENTRO deste
 * processo chama (ver "Quem cria trabalho no processo avisa", no cabeçalho);
 * o resto espera o TTL.
 */
export function invalidarRetrato(): void {
  retrato = null;
  carregando = null;
  geracao += 1;
}

/** O nome que os testes usam para zerar o estado entre casos. */
export const esquecerRetrato = invalidarRetrato;

/**
 * Semeia o retrato sem tocar no banco. Só o teste usa (`tests/unit/piso-ocioso-dos-crons.test.ts`):
 * as rotas chamam `recursoOcioso(recurso)` sem argumentos, então este é o único
 * jeito de exercitar a saída antecipada de cada rota pelo caminho REAL do
 * portão, sem depender de banco nem de mock do módulo (mock de módulo vaza
 * entre arquivos da suíte — medido nesta entrega).
 */
export function semearRetrato(
  emUso: Record<RecursoDoCron, boolean>,
  ate: number = Date.now() + TTL_DO_RETRATO_MS,
): void {
  retrato = { emUso, ate };
  carregando = null;
}
