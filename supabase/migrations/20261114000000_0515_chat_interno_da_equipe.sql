-- 0515 — chat interno da equipe (13/11/2026).
--
-- Paridade com a Umbler Talk ("Chat interno"): quem trabalha na empresa
-- conversa entre si sem sair do CRM — uma sala "Geral" com a equipe inteira e
-- conversas diretas entre duas pessoas. Nada disso vai ao cliente.
--
--   equipe_mensagens — `destinatario_user_id` nulo = sala Geral; preenchido =
--     conversa direta entre o autor e o destinatário. A leitura (RLS) é de
--     quem é da organização, e a conversa direta só das duas pessoas: nem o
--     administrador lê a conversa direta dos outros.
--   equipe_leituras — até onde cada pessoa leu cada conversa ('geral' ou o id
--     da outra pessoa): é o que acende o número de não lidas no menu.
--
-- Quem escreve é só o servidor (/api/v1/equipe/*, com a service role), que
-- confere autor e destinatário na organização. Realtime na publicação, para a
-- mensagem aparecer na hora. Idempotente.

-- ---- chat interno da equipe (migration 0515) ----
create table if not exists public.equipe_mensagens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  autor_user_id uuid not null references auth.users(id) on delete cascade,
  destinatario_user_id uuid references auth.users(id) on delete cascade,
  corpo text not null check (char_length(btrim(corpo)) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint equipe_mensagens_nao_para_si
    check (destinatario_user_id is null or destinatario_user_id <> autor_user_id)
);
comment on table public.equipe_mensagens is
  'Chat interno da equipe (paridade com a Umbler): destinatario_user_id nulo = sala Geral; preenchido = conversa direta entre duas pessoas, que só as duas leem. Nunca vai ao cliente. Escrita só pelo servidor. Migration 0515.';
create index if not exists equipe_mensagens_geral
  on public.equipe_mensagens (organization_id, created_at desc) where destinatario_user_id is null;
create index if not exists equipe_mensagens_diretas
  on public.equipe_mensagens (organization_id, autor_user_id, destinatario_user_id, created_at desc)
  where destinatario_user_id is not null;
create index if not exists equipe_mensagens_recebidas
  on public.equipe_mensagens (organization_id, destinatario_user_id, created_at desc)
  where destinatario_user_id is not null;
alter table public.equipe_mensagens enable row level security;
drop policy if exists equipe_mensagens_select on public.equipe_mensagens;
create policy equipe_mensagens_select on public.equipe_mensagens
  for select using (
    organization_id in (select public.fn_user_org_ids())
    and (
      destinatario_user_id is null
      or autor_user_id = auth.uid()
      or destinatario_user_id = auth.uid()
    )
  );
-- Revoga dos DOIS papéis antes de conceder: o default ACL do Supabase dá tudo
-- (TRUNCATE inclusive) a anon e authenticated, e um GRANT enumerado só acrescenta.
revoke all on table public.equipe_mensagens from anon, authenticated;
grant select on table public.equipe_mensagens to authenticated;
grant all on table public.equipe_mensagens to service_role;

create table if not exists public.equipe_leituras (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversa text not null check (conversa = 'geral' or conversa ~ '^[0-9a-f-]{36}$'),
  lida_ate timestamptz not null default now(),
  primary key (organization_id, user_id, conversa)
);
comment on table public.equipe_leituras is
  'Até onde cada pessoa leu cada conversa do chat interno (''geral'' ou o id da outra pessoa). Acende o número de não lidas. Escrita só pelo servidor. Migration 0515.';
alter table public.equipe_leituras enable row level security;
drop policy if exists equipe_leituras_select on public.equipe_leituras;
create policy equipe_leituras_select on public.equipe_leituras
  for select using (organization_id in (select public.fn_user_org_ids()) and user_id = auth.uid());
revoke all on table public.equipe_leituras from anon, authenticated;
grant select on table public.equipe_leituras to authenticated;
grant all on table public.equipe_leituras to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'equipe_mensagens'
     ) then
    execute 'alter publication supabase_realtime add table public.equipe_mensagens';
  end if;
end $$;
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
