-- migration 0504 — o chatbot sabe a quem entregou o atendimento
--
-- Depois que o chatbot entrega a conversa (à fila da equipe, a um setor, a um
-- atendente ou ao agente de IA), ele não volta a entrar NESTE atendimento —
-- volta quando o atendimento é finalizado e o contato escreve de novo
-- (`conversations.service_started_at` muda), como na Umbler Talk. Antes a única
-- barreira era a de 6 h, e quem ficava sem resposta na fila (ou com a IA)
-- recebia o menu de novo no meio do atendimento (cards 54/58 do chatbot).
--
-- A entrega à IA não deixa rastro na conversa (a devolução limpa as travas de
-- passagem), então o rastro mora na sessão do chatbot. Uma rodada nova do mesmo
-- fluxo zera as duas colunas (`gravarSessao`). Aditiva e idempotente; nenhum
-- dado existente muda.
alter table public.chatbot_sessions add column if not exists entregue_a text;
alter table public.chatbot_sessions add column if not exists entregue_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'chatbot_sessions_entregue_a_check'
                    and conrelid = 'public.chatbot_sessions'::regclass) then
    alter table public.chatbot_sessions
      add constraint chatbot_sessions_entregue_a_check
      check (entregue_a is null or entregue_a in ('ia', 'equipe', 'atendente'));
  end if;
end $$;

create index if not exists idx_chatbot_sessions_entregue
  on public.chatbot_sessions (organization_id, conversation_id, entregue_em)
  where entregue_em is not null;
