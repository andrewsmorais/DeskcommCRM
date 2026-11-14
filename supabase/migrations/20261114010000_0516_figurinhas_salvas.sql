-- 0516 — figurinhas salvas (14/11/2026).
--
-- Paridade com a Umbler Talk: a empresa guarda figurinhas (as que recebeu ou
-- que enviou do computador) e qualquer atendente as manda na conversa. O
-- arquivo mora no bucket privado `whatsapp-media`, em `<org>/figurinhas/`, já
-- convertido para WebP 512×512 (o formato que o WhatsApp exige). `hash` evita a
-- mesma figurinha duas vezes na biblioteca. Leitura por quem é da organização;
-- escrita só pelo servidor (/api/v1/figurinhas). Não aponta para contato nenhum:
-- a figurinha é da empresa. Idempotente.

-- ---- figurinhas salvas (migration 0516) ----
create table if not exists public.figurinhas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 1 and 300),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint figurinhas_uma_por_arquivo unique (organization_id, hash)
);
comment on table public.figurinhas is
  'Figurinhas salvas da empresa (paridade com a Umbler): WebP 512x512 em whatsapp-media/<org>/figurinhas/, sem vínculo com contato. Escrita só pelo servidor. Migration 0516.';
create index if not exists figurinhas_da_empresa on public.figurinhas (organization_id, created_at desc);
alter table public.figurinhas enable row level security;
drop policy if exists figurinhas_select on public.figurinhas;
create policy figurinhas_select on public.figurinhas
  for select using (organization_id in (select public.fn_user_org_ids()));
-- Revoga dos DOIS papéis antes de conceder: o default ACL do Supabase dá tudo
-- (TRUNCATE inclusive) a anon e authenticated, e um GRANT enumerado só acrescenta.
revoke all on table public.figurinhas from anon, authenticated;
grant select on table public.figurinhas to authenticated;
grant all on table public.figurinhas to service_role;
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
