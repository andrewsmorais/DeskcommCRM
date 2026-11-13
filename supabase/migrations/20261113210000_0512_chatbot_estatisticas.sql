-- 0512 — estatística por bloco do chatbot (13/11/2026).
--
-- Paridade com a Umbler Talk: no editor, cada bloco mostra quantas vezes foi
-- concluído e a porcentagem que saiu por cada saída, com exportar em CSV.
-- Uma linha por (fluxo, bloco, saída, dia) com a contagem do dia — o worker
-- soma ao concluir cada turno (lib/chatbot/executar.ts, `concluirTurno`).
-- Não guarda contato nem texto: só contagens. Leitura por quem é da
-- organização; escrita só pelo servidor. Idempotente.

-- ---- estatística por bloco do chatbot (migration 0512) ----
create table if not exists public.chatbot_estatisticas (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_id uuid not null references public.chatbot_flows(id) on delete cascade,
  node_id text not null check (char_length(node_id) between 1 and 100),
  saida text not null check (char_length(saida) between 1 and 60),
  dia date not null,
  contagem integer not null default 0 check (contagem >= 0),
  primary key (organization_id, flow_id, node_id, saida, dia)
);
comment on table public.chatbot_estatisticas is
  'Estatística por bloco do chatbot (paridade com a Umbler): quantas vezes cada bloco foi concluído e por qual saída, por dia. Só contagens, sem contato. O worker soma ao concluir cada turno. Migration 0512.';
create index if not exists chatbot_estatisticas_do_fluxo
  on public.chatbot_estatisticas (organization_id, flow_id, dia);
alter table public.chatbot_estatisticas enable row level security;
drop policy if exists chatbot_estatisticas_select on public.chatbot_estatisticas;
create policy chatbot_estatisticas_select on public.chatbot_estatisticas
  for select using (organization_id in (select public.fn_user_org_ids()));
-- Revoga dos DOIS papéis antes de conceder: o default ACL do Supabase dá tudo
-- (TRUNCATE inclusive) a anon e authenticated, e um GRANT enumerado só acrescenta.
revoke all on table public.chatbot_estatisticas from anon, authenticated;
grant select on table public.chatbot_estatisticas to authenticated;
grant all on table public.chatbot_estatisticas to service_role;
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
