-- migration 0505 — chatbot: rascunho e versões publicadas
--
-- Até aqui, salvar um fluxo LIGADO valia na hora para os clientes: não havia
-- "publicar" separado de "salvar", nem histórico para voltar atrás, nem
-- controle de duas abas salvando por cima uma da outra (pendência V1 da
-- auditoria funcional de 03/11; padrão de mercado — Umbler, Blip, Typebot).
--
-- 1. `chatbot_flows.rascunho`: o desenho em edição de um fluxo ligado. O motor
--    continua lendo `chatbot_flows.grafo` (o PUBLICADO); salvar um fluxo ligado
--    grava aqui, e só "Publicar" (a rota) copia para `grafo`. NULL = sem
--    mudança pendente.
-- 2. `chatbot_flow_versions`: cada publicação vira uma linha imutável
--    (número, desenho, quem e quando). Restaurar copia uma versão para o
--    rascunho. Só o servidor grava (a rota usa a service role); membros leem.
-- 3. Fluxo já ligado ganha a versão 1 com o desenho que está rodando, para
--    haver para onde voltar desde o primeiro dia.
--
-- Aditiva e idempotente; o que roda hoje não muda.
alter table public.chatbot_flows add column if not exists rascunho jsonb;

create table if not exists public.chatbot_flow_versions (
  id               uuid        not null default gen_random_uuid() primary key,
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  flow_id          uuid        not null references public.chatbot_flows(id) on delete cascade,
  numero           integer     not null check (numero > 0),
  grafo            jsonb       not null,
  publicada_por    uuid        references auth.users(id) on delete set null,
  publicada_em     timestamptz not null default now(),
  unique (flow_id, numero)
);
create index if not exists idx_chatbot_flow_versions_flow
  on public.chatbot_flow_versions (organization_id, flow_id, numero desc);

alter table public.chatbot_flow_versions enable row level security;
revoke all on public.chatbot_flow_versions from anon;
revoke insert, update, delete, truncate on public.chatbot_flow_versions from authenticated;
drop policy if exists chatbot_flow_versions_leitura on public.chatbot_flow_versions;
create policy chatbot_flow_versions_leitura on public.chatbot_flow_versions
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));

insert into public.chatbot_flow_versions (organization_id, flow_id, numero, grafo, publicada_em)
select f.organization_id, f.id, 1, f.grafo, coalesce(f.updated_at, now())
  from public.chatbot_flows f
 where f.is_active
   and not exists (select 1 from public.chatbot_flow_versions v where v.flow_id = f.id);

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
