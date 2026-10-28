-- 0494 — Perguntas feitas ao assistente de ajuda.
--
-- Uma linha por mensagem respondida (ou recusada pelo limite diário). Serve a
-- três leitores: o limite de mensagens por organização por dia, o painel do
-- dono da plataforma ("onde os clientes travam") e o custo do assistente
-- (tokens de entrada, de cache e de saída).
--
-- Server-side only: RLS ligada e sem policy; só o service role lê e escreve.
-- A pergunta é texto do cliente e pode conter dado pessoal: a rota do chat
-- apaga as linhas da organização com mais de 90 dias a cada mensagem nova
-- (`lib/ajuda/registro.ts`), então nada fica além do prazo para quem usa.
create table if not exists public.ajuda_mensagens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid,
  pergunta text not null,
  resposta text,
  escalou boolean not null default false,
  tela text,
  tokens_entrada integer,
  tokens_cache integer,
  tokens_saida integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_ajuda_mensagens_org_dia
  on public.ajuda_mensagens (organization_id, created_at desc);

alter table public.ajuda_mensagens enable row level security;
revoke all on public.ajuda_mensagens from anon, authenticated;
comment on table public.ajuda_mensagens is
  'Perguntas ao assistente de ajuda. Server-side only (sem policy). Limite diário, painel do dono e custo.';

do $f$ begin perform public.fn_proteger_tabelas_de_organizacao(); end $f$;
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
