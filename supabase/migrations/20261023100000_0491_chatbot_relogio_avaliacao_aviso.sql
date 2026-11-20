-- migration 0491 — Chatbot: espera no relógio, avaliação e aviso à equipe
--
-- Três passos novos do editor de chatbot (modelo Umbler Talk) precisam de
-- lugar no banco; o resto da fase 2 é só código.
--
-- 1. `chatbot_sessions.retomar_em` e `retomada_token`: "Aguardar intervalo" e
--    "Aguardar até" param o fluxo no relógio (status `waiting_timer`, coluna
--    `status` é text sem CHECK). O executor agenda um
--    `chatbot.retomada_requested` no `event_log` com `next_attempt_at`, e o
--    drain do worker o consome. O token amarra o evento à espera que o criou:
--    se o contato respondeu e o fluxo seguiu antes, o evento antigo chega,
--    não bate o token e é descartado — o fluxo nunca anda duas vezes.
--
-- 2. `chatbot_avaliacoes`: a nota de "Pedir para avaliar" (e se houve
--    comentário em "Pedir feedback escrito"), uma linha por rodada do fluxo
--    na conversa. SEM texto livre de propósito: o comentário vai para a
--    conversa como nota interna, onde a equipe o lê; aqui fica só o número,
--    para a média aparecer na lista de chatbots. Sem `contact_id`: o contato
--    sai da conversa (doutrina DIRC — integrar, não duplicar). `flow_id` e
--    `session_id` com `on delete set null`: apagar o fluxo não apaga o
--    histórico de satisfação.
--
-- 3. `agent_inbox_items.kind` ganha `chatbot_aviso` (passo "Notificar
--    atendente"): aviso na Central de avisos com link para a conversa.
--
-- Idempotente. Sem BEGIN/COMMIT (o runner já envolve em transação).

alter table public.chatbot_sessions
  add column if not exists retomar_em timestamptz,
  add column if not exists retomada_token uuid;

create index if not exists idx_chatbot_sessions_relogio
  on public.chatbot_sessions (retomar_em)
  where status = 'waiting_timer';

create table if not exists public.chatbot_avaliacoes (
  id               uuid        not null default gen_random_uuid() primary key,
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  flow_id          uuid        references public.chatbot_flows(id) on delete set null,
  session_id       uuid        references public.chatbot_sessions(id) on delete set null,
  rodada_em        timestamptz not null,
  conversation_id  uuid        not null references public.conversations(id) on delete cascade,
  nota             smallint,
  escala           text,
  comentou         boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chatbot_avaliacoes_rodada_unica unique (organization_id, conversation_id, rodada_em),
  constraint chatbot_avaliacoes_escala_check check (escala is null or escala in ('1_5', '0_10')),
  constraint chatbot_avaliacoes_nota_na_escala check (
    nota is null
    or (escala = '1_5' and nota between 1 and 5)
    or (escala = '0_10' and nota between 0 and 10)
  )
);
create index if not exists idx_chatbot_avaliacoes_fluxo
  on public.chatbot_avaliacoes (organization_id, flow_id, created_at desc);

alter table public.chatbot_avaliacoes enable row level security;
revoke all on public.chatbot_avaliacoes from anon;
revoke insert, update, delete, truncate on public.chatbot_avaliacoes from authenticated;
drop policy if exists chatbot_avaliacoes_leitura on public.chatbot_avaliacoes;
create policy chatbot_avaliacoes_leitura on public.chatbot_avaliacoes
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;
alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'proposta_travada',
    'proposta_pronta_para_revisao',
    'chatbot_aviso',
    'other'
  ));

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
