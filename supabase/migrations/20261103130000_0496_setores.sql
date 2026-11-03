-- ---- setores (migration 0496) ----
-- "Setores" da Umbler Talk: grupos de atendentes (Vendas, Suporte, Financeiro)
-- para onde a conversa é transferida. A conversa guarda o setor
-- (`conversations.setor_id`) e a Distribuição de atendimento só entrega a
-- conversa a quem é membro dele (lib/routing/eligibles.ts). Sem setor, vale a
-- equipe toda — o comportamento de sempre.
--
-- Leitura: qualquer membro da organização (o atendente precisa ver os setores
-- para transferir). Escrita: gerente/admin. Sem função security definer.
--
-- Idempotente: `if not exists`, policies recriadas, FK criada só se faltar.
create table if not exists public.setores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  descricao text check (descricao is null or char_length(descricao) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

comment on table public.setores is
  'Setores de atendimento (Vendas, Suporte…): grupos de atendentes. A conversa com setor_id só é distribuída a membros do setor (setor_membros). Migration 0496.';

create unique index if not exists setores_nome_unico
  on public.setores (organization_id, lower(btrim(nome)));

create table if not exists public.setor_membros (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  setor_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (setor_id, user_id),
  foreign key (organization_id, setor_id) references public.setores(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.user_organizations(organization_id, user_id) on delete cascade
);

create index if not exists setor_membros_usuario on public.setor_membros (organization_id, user_id);

alter table public.conversations add column if not exists setor_id uuid;

comment on column public.conversations.setor_id is
  'Setor da conversa (setores.id). A Distribuição de atendimento só a entrega a membros do setor; null = equipe toda. Gravado pela rota POST /api/v1/conversations/[id]/setor e pelo passo "Transferir para a equipe" do chatbot.';

do $setores_fk$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'conversations_setor_fk' and conrelid = 'public.conversations'::regclass
  ) then
    -- Setor apagado zera só o setor_id (não o organization_id da conversa).
    alter table public.conversations
      add constraint conversations_setor_fk
      foreign key (organization_id, setor_id)
      references public.setores(organization_id, id)
      on delete set null (setor_id);
  end if;
end
$setores_fk$;

create index if not exists conversations_setor
  on public.conversations (organization_id, setor_id) where setor_id is not null;

alter table public.setores enable row level security;
drop policy if exists setores_select on public.setores;
create policy setores_select on public.setores
  for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists setores_insert on public.setores;
create policy setores_insert on public.setores
  for insert with check (organization_id in (select public.fn_user_org_ids())
                         and public.fn_role_at_least(organization_id, 'manager'));
drop policy if exists setores_update on public.setores;
create policy setores_update on public.setores
  for update
  using (organization_id in (select public.fn_user_org_ids())
         and public.fn_role_at_least(organization_id, 'manager'))
  with check (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'manager'));
drop policy if exists setores_delete on public.setores;
create policy setores_delete on public.setores
  for delete using (organization_id in (select public.fn_user_org_ids())
                    and public.fn_role_at_least(organization_id, 'manager'));
revoke all on table public.setores from anon;
grant select, insert, update, delete on table public.setores to authenticated;
grant all on table public.setores to service_role;

alter table public.setor_membros enable row level security;
drop policy if exists setor_membros_select on public.setor_membros;
create policy setor_membros_select on public.setor_membros
  for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists setor_membros_insert on public.setor_membros;
create policy setor_membros_insert on public.setor_membros
  for insert with check (organization_id in (select public.fn_user_org_ids())
                         and public.fn_role_at_least(organization_id, 'manager'));
drop policy if exists setor_membros_delete on public.setor_membros;
create policy setor_membros_delete on public.setor_membros
  for delete using (organization_id in (select public.fn_user_org_ids())
                    and public.fn_role_at_least(organization_id, 'manager'));
revoke all on table public.setor_membros from anon;
grant select, insert, delete on table public.setor_membros to authenticated;
grant all on table public.setor_membros to service_role;
