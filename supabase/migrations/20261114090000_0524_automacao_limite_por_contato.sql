-- 0524 — Automação: no máximo uma vez por contato, ou só depois de N horas
-- (vindo do produto original: 0733 + 0740 de lá numa só).
--
-- `automation_rule_runs.contact_id` (nullable, sem backfill — linha antiga não
-- sabe de que contato era; NULL é fail-open no motor) com índice parcial por
-- (organização, regra, contato, criação): é a pergunta "esta regra já rodou para
-- este contato (nas últimas N horas)?". `on delete set null`: o registro da
-- execução sobrevive ao expurgo do contato.
--
-- `automation_rule_contact_claims`: a reserva da chave (organização, regra,
-- contato) para "uma vez por contato", tomada ANTES de executar — o índice
-- único é o árbitro da corrida entre dois eventos do mesmo contato. Aditiva e
-- idempotente; espelho no apêndice do baseline.

alter table public.automation_rule_runs
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists idx_automation_rule_runs_org_regra_contato
  on public.automation_rule_runs (organization_id, rule_id, contact_id, created_at)
  where contact_id is not null;

create table if not exists public.automation_rule_contact_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  event_id uuid references public.event_log(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_automation_rule_contact_claims_org_regra_contato
  on public.automation_rule_contact_claims (organization_id, rule_id, contact_id);

-- Só o motor (service role) escreve e lê: RLS ligada e nenhuma policy, e os
-- papéis do PostgREST sem grant nenhum (o default ACL do Supabase daria tudo).
alter table public.automation_rule_contact_claims enable row level security;
revoke all on public.automation_rule_contact_claims from anon, authenticated;
