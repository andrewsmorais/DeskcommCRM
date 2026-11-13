-- 0511 — mensagens agendadas (13/11/2026).
--
-- Paridade com a Umbler Talk: na conversa, o atendente agenda uma mensagem, uma
-- nota interna ou um chatbot para um dia e hora. O worker
-- envia pelo mesmo caminho da tela, em nome de quem agendou. Leitura por quem
-- enxerga a conversa; escrita só pelo servidor. Anonimizar o contato apaga as
-- agendadas dele. Idempotente: o update.sh reaplica o baseline inteiro.

-- ---- funções das mensagens agendadas (migration 0511) ----
-- Antes da varredura de anon de propósito (tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts).
-- A tabela, as políticas e os gatilhos ficam no bloco da 0511, no fim do apêndice.
--
-- Anonimizar o contato (LGPD) apaga as mensagens agendadas dele: o texto é dado
-- pessoal e não pode sair depois da anonimização. O pedido de acesso aos dados
-- as entrega antes (lib/lgpd/export-collector.ts).
create or replace function public.fn_mensagens_agendadas_ao_anonimizar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_anonymized is true and old.is_anonymized is distinct from true then
    delete from public.mensagens_agendadas
     where organization_id = new.organization_id and contact_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.fn_mensagens_agendadas_ao_anonimizar() from public, anon, authenticated;

-- ---- mensagens agendadas (migration 0511) ----
-- Como o "Agendar mensagens" da Umbler: o atendente deixa na conversa uma
-- mensagem, uma nota interna ou um chatbot para sair num dia e hora. Quem lê é
-- quem enxerga a conversa; quem escreve é só o servidor (rotas de
-- /api/v1/conversations/[id]/agendadas, com a service role, e o worker).
create table if not exists public.mensagens_agendadas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tipo text not null check (tipo in ('mensagem', 'nota', 'chatbot')),
  texto text check (texto is null or char_length(texto) <= 4096),
  chatbot_flow_id uuid references public.chatbot_flows(id) on delete set null,
  enviar_em timestamptz not null,
  status text not null default 'agendada'
    check (status in ('agendada', 'processando', 'enviada', 'falhou', 'cancelada')),
  erro text check (erro is null or char_length(erro) <= 500),
  criado_por uuid not null references auth.users(id) on delete cascade,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mensagens_agendadas_texto_obrigatorio
    check (tipo = 'chatbot' or (texto is not null and char_length(btrim(texto)) > 0))
);
comment on table public.mensagens_agendadas is
  'Mensagem, nota ou chatbot agendado numa conversa (paridade com a Umbler). O worker envia no horário (evento mensagem_agendada.vencida no event_log) pelo mesmo caminho da tela, em nome de quem agendou. Migration 0511.';
create index if not exists mensagens_agendadas_vencidas
  on public.mensagens_agendadas (enviar_em) where status = 'agendada';
create index if not exists mensagens_agendadas_da_conversa
  on public.mensagens_agendadas (organization_id, conversation_id, enviar_em);
alter table public.mensagens_agendadas enable row level security;
drop policy if exists mensagens_agendadas_select on public.mensagens_agendadas;
create policy mensagens_agendadas_select on public.mensagens_agendadas
  for select using (
    organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1 from public.conversations c
       where c.organization_id = mensagens_agendadas.organization_id
         and c.id = mensagens_agendadas.conversation_id
         and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)
    )
  );
-- Revoga dos DOIS papéis antes de conceder: o default ACL do Supabase dá tudo
-- (TRUNCATE inclusive) a anon e authenticated, e um GRANT enumerado só acrescenta.
revoke all on table public.mensagens_agendadas from anon, authenticated;
grant select on table public.mensagens_agendadas to authenticated;
grant all on table public.mensagens_agendadas to service_role;
drop trigger if exists trg_mensagens_agendadas_updated_at on public.mensagens_agendadas;
create trigger trg_mensagens_agendadas_updated_at
  before update on public.mensagens_agendadas
  for each row execute function public.fn_set_updated_at();
drop trigger if exists trg_mensagens_agendadas_ao_anonimizar on public.contacts;
create trigger trg_mensagens_agendadas_ao_anonimizar
  after update of is_anonymized on public.contacts
  for each row execute function public.fn_mensagens_agendadas_ao_anonimizar();
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
