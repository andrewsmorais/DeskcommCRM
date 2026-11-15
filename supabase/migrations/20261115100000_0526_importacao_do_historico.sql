-- manifest: **Importação do histórico do WhatsApp e recuperação das conversas da queda** (trazido do produto original: 0741, 0760, 0761 e 9033 juntas). (1) A mensagem marcada `metadata.historico_importado = 'true'` não passa pelos 4 gatilhos de INSERT de `messages` (não reabre conversa, não emite `message.received`, não sobe revisão, não reexibe conversa oculta) — mesmo molde do corte da reação (0525). (2) `fn_upsert_wa_conversation_importada`: devolve a conversa 1:1 existente sem tocar nela, ou cria uma `closed`, sem dono, com `last_message_at` da última mensagem — não entra na fila de roteamento. (3) Tabela `importacoes_de_historico` (prévia, rodando, aguardando, concluída, erro, cancelada; escopo todos/só fichas do CRM; origem manual/queda; janela por dias ou desde/até), RLS só leitura por org, escrita só service_role. (4) Dois avisos novos na Central: `recuperacao_da_queda` e `cliente_sem_resposta_na_queda`, com índice único de aberto. (5) LGPD: ao anonimizar um contato, guarda só sal + HMAC do telefone e do lid em `lgpd_marcas_de_apagamento` (ninguém lê pela REST), e `fn_titular_apagado_a_pedido` diz se aquele número foi apagado a pedido — a importação pula essas pessoas.
--
-- Importação do histórico do WhatsApp (trazida do produto original, #999 e Spec 32).
-- Idempotente: create or replace, if not exists, drop/add constraint.

-- 1. o histórico importado não é mensagem recebida
create or replace function public.fn_demanda_abre_no_inbound()
returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  if new.type = 'reaction' then
    return new;
  end if;
  if coalesce(new.metadata->>'historico_importado','') = 'true' then
    return new;
  end if;
  perform public.fn_service_inbound(new.id);
  return new;
end; $fn$;
revoke execute on function public.fn_demanda_abre_no_inbound() from public,anon,authenticated;

create or replace function public.fn_emit_message_event() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $fn$
declare
  v_event text;
begin
  if new.type = 'reaction' then
    return new;
  end if;
  if coalesce(new.metadata->>'historico_importado','') = 'true' then
    return new;
  end if;
  if new.direction = 'inbound' then
    if exists (select 1 from public.conversations c
               where c.id = new.conversation_id and c.organization_id = new.organization_id and c.is_group) then
      v_event := 'message.group_received';
    else
      v_event := 'message.received';
    end if;
  else
    v_event := case new.status
                 when 'sending' then 'message.sending'
                 when 'sent' then 'message.sent'
                 when 'failed' then 'message.failed'
                 else 'message.outbound'
               end;
  end if;

  perform public.fn_log_event(
    new.organization_id, v_event,
    jsonb_build_object(
      'message_id', new.id, 'conversation_id', new.conversation_id,
      'contact_id', new.contact_id, 'direction', new.direction,
      'type', new.type, 'status', new.status, 'external_id', new.external_id,
      'channel_session_id', new.channel_session_id,
      'body_preview', "left"(new.body, 280)
    )
  );
  return new;
end$fn$;
grant all on function public.fn_emit_message_event() to anon;
grant all on function public.fn_emit_message_event() to authenticated;
grant all on function public.fn_emit_message_event() to service_role;

create or replace function public.fn_reply_inbound_revision() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  if new.direction='inbound' and new.type <> 'reaction'
     and coalesce(new.metadata->>'historico_importado','') <> 'true' then
    update public.conversations set reply_context_revision=reply_context_revision+1 where organization_id=new.organization_id and id=new.conversation_id and contact_id=new.contact_id;
  end if;
  return new;
end;$fn$;
revoke all on function public.fn_reply_inbound_revision() from public,anon,authenticated;


create or replace function public.fn_reexibir_conversa_oculta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.direction = 'inbound' and new.type <> 'reaction'
     and coalesce(new.metadata->>'historico_importado','') <> 'true' then
    update public.conversations
       set visibilidade = 'visivel'
     where organization_id = new.organization_id
       and id = new.conversation_id
       and visibilidade = 'oculta_ate_mensagem';
  end if;
  return new;
end $$;

-- 2. a conversa que o importador cria
create or replace function public.fn_upsert_wa_conversation_importada(
  p_org uuid, p_contact uuid, p_session uuid, p_last_message_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare v_id uuid;
begin
  select c.id into v_id
    from public.conversations c
   where c.organization_id = p_org and c.contact_id = p_contact
     and c.channel_session_id = p_session and c.is_group = false;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations
    (organization_id, contact_id, channel_session_id, channel, status, is_group, unread_count_for_assignee, metadata, last_message_at)
  values (p_org, p_contact, p_session, 'whatsapp', 'closed', false, 0, '{}'::jsonb, p_last_message_at)
  on conflict (organization_id, contact_id, channel_session_id) where is_group = false
  do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id
      from public.conversations c
     where c.organization_id = p_org and c.contact_id = p_contact
       and c.channel_session_id = p_session and c.is_group = false;
  end if;
  return v_id;
end; $fn$;

comment on function public.fn_upsert_wa_conversation_importada(uuid, uuid, uuid, timestamptz) is
  'Irmã de fn_upsert_wa_conversation para o importador de histórico do WhatsApp (#999): devolve a conversa 1:1 existente (organização + contato + sessão) sem tocar nela, ou cria uma closed e sem dono, com last_message_at = p_last_message_at — que não emite conversation.routing_requested. Só service_role.';

revoke all on function public.fn_upsert_wa_conversation_importada(uuid, uuid, uuid, timestamptz) from public;
revoke execute on function public.fn_upsert_wa_conversation_importada(uuid, uuid, uuid, timestamptz) from anon, authenticated;
grant execute on function public.fn_upsert_wa_conversation_importada(uuid, uuid, uuid, timestamptz) to service_role;

-- 3. a tabela das importações
create table if not exists public.importacoes_de_historico (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  status text not null default 'previa'
    check (status in ('previa', 'rodando', 'concluida', 'erro', 'cancelada')),
  dias int not null check (dias in (30, 90, 180, 365)),
  cursor jsonb not null default '{}'::jsonb,
  previa jsonb,
  conversas_feitas int not null default 0,
  mensagens_gravadas int not null default 0,
  mensagens_existentes int not null default 0,
  mensagens_ignoradas int not null default 0,
  midias_baixadas int not null default 0,
  midias_indisponiveis int not null default 0,
  erro text,
  criada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists importacoes_de_historico_uma_rodando_idx
  on public.importacoes_de_historico (channel_session_id)
  where status = 'rodando';
create index if not exists importacoes_de_historico_org_idx
  on public.importacoes_de_historico (organization_id, created_at desc);

alter table public.importacoes_de_historico enable row level security;
drop policy if exists tenant_isolation_importacoes_de_historico_select on public.importacoes_de_historico;
create policy tenant_isolation_importacoes_de_historico_select on public.importacoes_de_historico
  for select using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.importacoes_de_historico from public, anon, authenticated;
grant select on public.importacoes_de_historico to authenticated;
grant all on public.importacoes_de_historico to service_role;

alter table public.importacoes_de_historico
  add column if not exists escopo text not null default 'todos',
  add column if not exists origem text not null default 'manual',
  add column if not exists desde timestamptz,
  add column if not exists ate timestamptz,
  add column if not exists evento_de_saida_id uuid,
  add column if not exists numero_esperado text;

comment on column public.importacoes_de_historico.escopo is
  'todos = cria ficha para todo chat (a importação de sempre); so_crm = só chats que casam com ficha viva, sem criar nem alterar ficha (Spec 32).';
comment on column public.importacoes_de_historico.origem is
  'manual = o administrador pediu pela tela; queda = aberta sozinha pela volta de uma queda do número (Spec 32).';
comment on column public.importacoes_de_historico.ate is
  'Fim da janela (exclusivo). Filtro local da rodada: o cliente do canal só filtra desde. Na queda, é o instante do evento de volta, nunca depois (senão a recuperação gravaria antes do webhook uma mensagem ao vivo, que ficaria sem resposta).';
comment on column public.importacoes_de_historico.evento_de_saida_id is
  'event_log.id do channel_session.status_changed de saída que abriu esta recuperação. Sem FK de propósito (event_log é log); o índice único garante uma importação por queda.';
comment on column public.importacoes_de_historico.numero_esperado is
  'O número da conexão quando a queda foi detectada. Antes de começar, o cron lê o número ao vivo e compara: se mudou, cancela (o acervo seria de outro aparelho).';

alter table public.importacoes_de_historico alter column dias drop not null;

alter table public.importacoes_de_historico
  drop constraint if exists importacoes_de_historico_status_check;
alter table public.importacoes_de_historico
  add constraint importacoes_de_historico_status_check
  check (status in ('previa', 'aguardando', 'rodando', 'concluida', 'erro', 'cancelada'));

alter table public.importacoes_de_historico
  drop constraint if exists importacoes_de_historico_dias_check;
alter table public.importacoes_de_historico
  add constraint importacoes_de_historico_dias_check
  check (
    (dias in (30, 90, 180, 365) and desde is null and ate is null)
    or (dias is null and desde is not null and ate is not null and desde < ate)
  );

alter table public.importacoes_de_historico
  drop constraint if exists importacoes_de_historico_escopo_check;
alter table public.importacoes_de_historico
  add constraint importacoes_de_historico_escopo_check check (escopo in ('todos', 'so_crm'));

alter table public.importacoes_de_historico
  drop constraint if exists importacoes_de_historico_origem_check;
alter table public.importacoes_de_historico
  add constraint importacoes_de_historico_origem_check check (origem in ('manual', 'queda'));

create unique index if not exists importacoes_de_historico_evento_de_saida_idx
  on public.importacoes_de_historico (evento_de_saida_id)
  where evento_de_saida_id is not null;

-- 4. dois avisos novos na Central
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
    'recuperacao_da_queda',
    'cliente_sem_resposta_na_queda',
    'other'
  ));

create unique index if not exists agent_inbox_recuperacao_da_queda_aberto_unico
  on public.agent_inbox_items (organization_id, kind, ref_id)
  where status = 'open' and kind = 'recuperacao_da_queda';
create unique index if not exists agent_inbox_cliente_sem_resposta_na_queda_aberto_unico
  on public.agent_inbox_items (organization_id, kind, ref_id)
  where status = 'open' and kind = 'cliente_sem_resposta_na_queda';

-- 5. LGPD: a marca de quem foi apagado a pedido
create table if not exists public.lgpd_marcas_de_apagamento (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sal bytea not null,
  marca_telefone bytea,
  marca_lid bytea,
  created_at timestamptz not null default now(),
  constraint lgpd_marcas_de_apagamento_alguma_marca
    check (marca_telefone is not null or marca_lid is not null)
);
create index if not exists lgpd_marcas_de_apagamento_org
  on public.lgpd_marcas_de_apagamento(organization_id);
alter table public.lgpd_marcas_de_apagamento enable row level security;
revoke all on public.lgpd_marcas_de_apagamento from public, anon, authenticated, service_role;
grant select on public.lgpd_marcas_de_apagamento to service_role;

create or replace function public.fn_lgpd_guardar_marca_de_apagamento()
returns trigger language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_telefone text := nullif(regexp_replace(coalesce(old.phone_number, ''), '\D', '', 'g'), '');
  v_lid text := old.wa_lid;
  v_sal bytea;
begin
  if v_telefone is null and v_lid is null then
    return null;
  end if;
  v_sal := gen_random_bytes(32);
  insert into public.lgpd_marcas_de_apagamento (organization_id, sal, marca_telefone, marca_lid)
  values (
    new.organization_id,
    v_sal,
    case when v_telefone is null then null else hmac(convert_to(v_telefone, 'UTF8'), v_sal, 'sha256') end,
    case when v_lid is null then null else hmac(convert_to(v_lid, 'UTF8'), v_sal, 'sha256') end
  );
  return null;
end $$;
revoke execute on function public.fn_lgpd_guardar_marca_de_apagamento() from public, anon, authenticated, service_role;

drop trigger if exists trg_lgpd_guardar_marca_de_apagamento on public.contacts;
create trigger trg_lgpd_guardar_marca_de_apagamento after update of is_anonymized on public.contacts
  for each row when (new.is_anonymized and not old.is_anonymized)
  execute function public.fn_lgpd_guardar_marca_de_apagamento();

create or replace function public.fn_titular_apagado_a_pedido(p_org uuid, p_telefone text, p_lid text)
returns boolean language sql stable
set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1
      from public.lgpd_marcas_de_apagamento m
     where m.organization_id = p_org
       and (
         (m.marca_telefone is not null and exists (
            select 1 from unnest(public.fn_telefone_variantes(p_telefone)) as v(digitos)
             where m.marca_telefone = hmac(convert_to(v.digitos, 'UTF8'), m.sal, 'sha256')))
         or (m.marca_lid is not null
             and nullif(regexp_replace(coalesce(p_lid, ''), '@.*$', ''), '') is not null
             and m.marca_lid = hmac(convert_to(regexp_replace(p_lid, '@.*$', ''), 'UTF8'), m.sal, 'sha256'))
       )
  );
$$;
revoke execute on function public.fn_titular_apagado_a_pedido(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_titular_apagado_a_pedido(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
