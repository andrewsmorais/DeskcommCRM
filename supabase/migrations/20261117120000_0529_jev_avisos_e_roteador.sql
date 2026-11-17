-- manifest: **O Jev completo: avisos dos pedidos na Central e o resultado do roteador** (vindo do produto original: 0500 e 0547 de lá). (1) Dois avisos novos na Central, `jev_pedido_de_humano` e `jev_parar_de_receber` — o Jev percebe, numa mensagem do cliente, um pedido para falar com uma pessoa ou para parar de receber que a regra de hoje não pegou; um aviso por conversa e pedido (índice único parcial), e eles fecham sozinhos quando alguém assume, a conversa encerra ou o contato é bloqueado (dois gatilhos, nenhum faz HTTP). (2) `jev_observacoes` ganha `intencao_jev`/`intencao_atual`, e a tabela `jev_router_decisions` guarda cada decisão do roteador quando o Jev decide sob demanda (RLS só leitura por org; escrita só service_role); o expurgo das observações passa a podar as duas. Tudo desligado por padrão: nada muda até alguém ligar o Jev com uma chave.
--
-- O Jev completo (trazido do produto original, migrations 0500 e 0547 de lá).
-- Idempotente: drop/add constraint, if not exists, create or replace.

-- 1. Os dois kinds novos na lista ÚNICA da constraint (a mesma que a 0526 refez).
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
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    'other'
  ));

-- 2. UM AVISO POR CONVERSA E PEDIDO, NO BANCO. Índice único parcial em
--    (organização, kind, conversa) para os dois kinds do Jev, SEM status — o
--    precedente é o `agent_inbox_routing_unique` do `routing_unassigned`. Com o
--    status fora do índice, o "Reabrir" nunca encontra um segundo aberto, e o
--    pedido novo sobre o mesmo aviso o REABRE em vez de abrir outro (o gravador,
--    lib/ai/decisao/pedidos.ts, faz o insert e trata o 23505). A busca antes da
--    escrita, que havia antes, deixava dois drenos simultâneos abrirem dois.
--    Antes do índice, os repetidos saem (fica o aberto, e o mais novo): só o
--    banco de quem rodou este PR antes do conserto os tem, mas o `update.sh`
--    de qualquer clone não pode quebrar aqui.
delete from public.agent_inbox_items a
 using (
   select id, row_number() over (
            partition by organization_id, kind, ref_id
            order by (status = 'open') desc, created_at desc, id desc
          ) as n
     from public.agent_inbox_items
    where kind in ('jev_pedido_de_humano','jev_parar_de_receber')
 ) d
 where a.id = d.id and d.n > 1;
create unique index if not exists agent_inbox_jev_pedido_unico
  on public.agent_inbox_items (organization_id, kind, ref_id)
  where kind in ('jev_pedido_de_humano','jev_parar_de_receber');

-- 3. O AVISO FECHA QUANDO O PEDIDO FOI ATENDIDO, por qualquer caminho.
--    A conversa saiu dos estados abertos (encerrada): os dois avisos.
--    A conversa ficou com uma pessoa — alguém assumiu, ou ela foi PASSADA:
--    `performHumanHandoff` (a regra de hoje, o descadastro ambíguo, a
--    ferramenta `request_human_handoff` do modelo), o orquestrador do clima e
--    a atribuição manual gravam `last_handoff_at` e calam o robô
--    (`bot_silenced_until` no futuro) — fecha SÓ o de falar com uma pessoa.
--    O de parar de receber segue aberto aí: o texto dele pede que a equipe
--    assuma E peça ao cliente o PARAR, e fechá-lo no primeiro passo sumiria
--    com o lembrete de um pedido de descadastro antes do passo que o atende.
--    No contato: bloqueado (`is_blocked` passa a true — o único escritor é o
--    STOP do próprio cliente, na entrada da mensagem, lib/channels/pos-entrada.ts;
--    ninguém da equipe bloqueia à mão), fecha o de parar de receber de todas
--    as conversas dele.
--    Gatilhos próprios, e não o de atribuição da 0228: aquele só dispara em
--    `assigned_to_user_id`/`status`, e a passagem nem sempre muda o status.
--    Nenhum faz HTTP; os dois filtram a organização da própria linha.
create or replace function public.fn_fechar_avisos_do_jev_da_conversa()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status not in('open','pending','claimed','ai_handling') then
  update public.agent_inbox_items set status='resolved',resolved_at=now()
   where organization_id=new.organization_id and ref_kind='conversation' and ref_id=new.id
     and kind in('jev_pedido_de_humano','jev_parar_de_receber') and status<>'resolved';
 elsif new.assigned_to_user_id is not null
    or (new.last_handoff_at is not null and new.last_handoff_at is distinct from old.last_handoff_at)
    or (new.bot_silenced_until > now() and new.bot_silenced_until is distinct from old.bot_silenced_until) then
  update public.agent_inbox_items set status='resolved',resolved_at=now()
   where organization_id=new.organization_id and ref_kind='conversation' and ref_id=new.id
     and kind='jev_pedido_de_humano' and status<>'resolved';
 end if;
 return new;
end;
$$;
revoke all on function public.fn_fechar_avisos_do_jev_da_conversa() from public,anon,authenticated;
drop trigger if exists trg_fechar_avisos_do_jev_da_conversa on public.conversations;
create trigger trg_fechar_avisos_do_jev_da_conversa
 after update of assigned_to_user_id,status,bot_silenced_until,last_handoff_at on public.conversations
 for each row execute function public.fn_fechar_avisos_do_jev_da_conversa();

create or replace function public.fn_fechar_aviso_do_jev_ao_bloquear()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.agent_inbox_items set status='resolved',resolved_at=now()
  where organization_id=new.organization_id and kind='jev_parar_de_receber' and ref_kind='conversation'
    and status<>'resolved'
    and ref_id in(select v.id from public.conversations v where v.organization_id=new.organization_id and v.contact_id=new.id);
 return new;
end;
$$;
revoke all on function public.fn_fechar_aviso_do_jev_ao_bloquear() from public,anon,authenticated;
drop trigger if exists trg_fechar_aviso_do_jev_ao_bloquear on public.contacts;
create trigger trg_fechar_aviso_do_jev_ao_bloquear
 after update of is_blocked on public.contacts
 for each row when (new.is_blocked and old.is_blocked is distinct from true)
 execute function public.fn_fechar_aviso_do_jev_ao_bloquear();

-- 3. As decisões do roteador do Jev (0547 de lá).
alter table public.jev_observacoes add column if not exists intencao_jev text;
alter table public.jev_observacoes add column if not exists intencao_atual text;

create table if not exists public.jev_router_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  router_id uuid not null,
  conversation_id uuid,
  message_id uuid,
  job_id uuid,
  modo text not null check (modo in ('tradicional_comparacao', 'jev_comparacao', 'jev_sob_demanda')),
  context_message_count integer not null check (context_message_count between 0 and 16),
  origem text not null check (origem in ('tradicional', 'jev', 'reserva')),
  motivo_reserva text check (motivo_reserva in ('falha_jev', 'baixa_confianca', 'sem_intencao', 'intencao_invalida')),
  intent_jev text,
  intent_tradicional text,
  intent_final text,
  agent_id_final uuid,
  confianca_final numeric,
  modelo_jev text,
  custo_jev_cents numeric,
  custo_tradicional_cents numeric,
  custo_incompleto boolean not null default false,
  tempo_total_ms integer not null,
  revisao text check (revisao in ('correto', 'incorreto')),
  agent_id_esperado uuid,
  revisado_por uuid,
  revisado_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists jev_router_decisions_org_message_idx
  on public.jev_router_decisions (organization_id, router_id, message_id)
  where message_id is not null;
create index if not exists jev_router_decisions_org_created_idx
  on public.jev_router_decisions (organization_id, created_at desc);

alter table public.jev_router_decisions enable row level security;
drop policy if exists tenant_isolation_jev_router_decisions_select on public.jev_router_decisions;
create policy tenant_isolation_jev_router_decisions_select on public.jev_router_decisions
  for select using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.jev_router_decisions from public, anon, authenticated;
grant select on public.jev_router_decisions to authenticated;
grant all on public.jev_router_decisions to service_role;

-- O mesmo horizonte das observações do Jev: 90 dias, piso de 30, com lote
-- compartilhado. O cron existente já chama esta função diariamente.
create or replace function public.fn_expurgar_observacoes_do_jev(
  p_retencao_dias int default null,
  p_limite int default null
) returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_dias int := greatest(coalesce(p_retencao_dias, 90), 30);
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 10000);
  v_observacoes int;
  v_decisoes int;
begin
  with vencidas as (
    select id from public.jev_observacoes
     where created_at < now() - make_interval(days => v_dias)
     order by created_at limit v_limite
  )
  delete from public.jev_observacoes o using vencidas v where o.id = v.id;
  get diagnostics v_observacoes = row_count;
  with vencidas as (
    select id from public.jev_router_decisions
     where created_at < now() - make_interval(days => v_dias)
     order by created_at limit (v_limite - v_observacoes)
  )
  delete from public.jev_router_decisions d using vencidas v where d.id = v.id;
  get diagnostics v_decisoes = row_count;
  return v_observacoes + v_decisoes;
end;
$$;
revoke all on function public.fn_expurgar_observacoes_do_jev(int,int) from public;
revoke execute on function public.fn_expurgar_observacoes_do_jev(int,int) from anon, authenticated;
grant execute on function public.fn_expurgar_observacoes_do_jev(int,int) to service_role;

notify pgrst, 'reload schema';
