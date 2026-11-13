-- 0510 — conversa oculta (13/11/2026).
--
-- Paridade com a Umbler Talk: o card "Visibilidade da conversa" do chatbot e o
-- botão da tela de Conversas tiram a conversa da caixa de entrada sem fechar o
-- atendimento. Ela continua existindo e aparece no filtro "Ocultas".
-- "Oculto até a próxima mensagem do contato" volta sozinho quando o contato
-- escreve. Idempotente: o update.sh reaplica o baseline inteiro.

-- ---- conversa oculta volta na mensagem do contato (migration 0510) ----
-- Antes da varredura de anon de propósito (tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts).
-- O gatilho, a coluna e o índice ficam no bloco da 0510, no fim do apêndice.
-- "Oculto até a próxima mensagem do contato": quando o contato escreve, a
-- conversa volta para a caixa de entrada sozinha. "Oculto" (sem prazo) fica
-- oculto até alguém mostrar.
create or replace function public.fn_reexibir_conversa_oculta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.direction = 'inbound' then
    update public.conversations
       set visibilidade = 'visivel'
     where organization_id = new.organization_id
       and id = new.conversation_id
       and visibilidade = 'oculta_ate_mensagem';
  end if;
  return new;
end $$;
revoke execute on function public.fn_reexibir_conversa_oculta() from public, anon, authenticated;

-- ---- conversa oculta (migration 0510) ----
-- Como o card "Visibilidade da conversa" da Umbler: a conversa oculta sai da
-- caixa de entrada (lista e contagem das abas) e aparece no filtro "Ocultas".
--   visivel              — como sempre foi;
--   oculta               — fica oculta até alguém mostrar;
--   oculta_ate_mensagem  — volta sozinha quando o contato escreve (gatilho).
-- Coluna nova com default: nenhum dado antigo viola o CHECK.
alter table public.conversations
  add column if not exists visibilidade text not null default 'visivel';
do $f$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'conversations_visibilidade_check'
       and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_visibilidade_check
      check (visibilidade in ('visivel', 'oculta', 'oculta_ate_mensagem'));
  end if;
end $f$;
create index if not exists idx_conversations_ocultas
  on public.conversations (organization_id, last_message_at desc)
  where visibilidade <> 'visivel';
drop trigger if exists trg_reexibir_conversa_oculta on public.messages;
create trigger trg_reexibir_conversa_oculta
  after insert on public.messages
  for each row execute function public.fn_reexibir_conversa_oculta();
