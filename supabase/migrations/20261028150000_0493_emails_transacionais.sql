-- 0493 — E-mails de relacionamento (boas-vindas, plano, reembolso).
--
-- `transactional_email_log` é o livro-razão: uma linha por e-mail enviado (ou por
-- plano registrado como base), único por (organização, chave). A reserva é feita
-- ANTES do envio — reentrega do evento cai no 23505 e vira "já enviado". Também é
-- dele que sai "qual foi o último plano dito à pessoa", que decide entre
-- contratado / melhorado / reduzido.
--
-- `fn_emitir_plano_alterado` avisa o event_log quando uma assinatura ENTRA em
-- trialing/active ou TROCA de plano. Trigger só escreve em event_log (nunca HTTP);
-- quem envia é o worker (`lib/emails-transacionais`).
--
-- Aditiva e idempotente. Só o servidor (service_role) lê e escreve o livro.
create table if not exists public.transactional_email_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dedupe_key text not null,
  tipo text not null check (tipo in (
    'boas_vindas','plano_contratado','plano_melhorado','plano_reduzido','reembolso','baseline'
  )),
  plan_type text,
  user_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);
create index if not exists idx_transactional_email_log_org_plano
  on public.transactional_email_log (organization_id, created_at desc)
  where plan_type is not null;

alter table public.transactional_email_log enable row level security;
revoke all on public.transactional_email_log from anon, authenticated;
comment on table public.transactional_email_log is
  'Livro dos e-mails de relacionamento enviados. Server-side only (sem policy): reserva antes do envio, único por organização e chave.';

create or replace function public.fn_emitir_plano_alterado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null or new.plan_type is null
     or new.status not in ('trialing','active') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.plan_type is not distinct from new.plan_type then
    return new;
  end if;
  perform public.emit_event(
    'plano.alterado', 'subscription', new.id,
    jsonb_build_object('plan_type', new.plan_type, 'status', new.status),
    '{}'::jsonb, new.organization_id
  );
  return new;
end $$;
revoke execute on function public.fn_emitir_plano_alterado() from public, anon;

drop trigger if exists trg_subscriptions_plano_alterado on public.subscriptions;
create trigger trg_subscriptions_plano_alterado
  after insert or update of status, plan_type on public.subscriptions
  for each row execute function public.fn_emitir_plano_alterado();

-- Quem já é cliente não recebe "obrigado por contratar" na primeira mudança
-- depois da atualização: o plano de hoje entra como base.
insert into public.transactional_email_log (organization_id, dedupe_key, tipo, plan_type)
select s.organization_id, 'baseline:inicial', 'baseline', s.plan_type
from public.subscriptions s
where s.organization_id is not null
  and s.plan_type is not null
  and s.status in ('trialing','active')
on conflict (organization_id, dedupe_key) do nothing;

do $f$ begin perform public.fn_proteger_tabelas_de_organizacao(); end $f$;
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
