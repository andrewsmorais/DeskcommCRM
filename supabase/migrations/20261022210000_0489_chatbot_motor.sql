-- migration 0489 — Chatbot Builder: o desenho salvo de uma vez e o estado do motor
--
-- 1. `chatbot_flows.grafo`: o desenho inteiro (passos + ligações) num jsonb,
--    gravado num UPDATE só. O editor apagava e reinseria `chatbot_nodes` e
--    `chatbot_edges` em duas operações soltas (fluxo podia ficar vazio no meio)
--    e com id de passo que a API recusava ("start-1"), então nada era salvo.
--    As duas tabelas ficam sem uso a partir daqui (fonte da verdade = grafo).
-- 2. `chatbot_sessions.no_atual` (text) e `tentativas`: onde a conversa está
--    parada esperando resposta. Texto, e não FK para `chatbot_nodes`: editar o
--    fluxo não pode apagar o lugar de quem está no meio dele.
-- 3. Índice para o motor achar rápido o fluxo ativo da organização e a sessão
--    que espera resposta numa conversa.
-- Idempotente; sem BEGIN/COMMIT (o runner já envolve em transação).

alter table public.chatbot_flows
  add column if not exists grafo jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  add column if not exists revisao integer not null default 0;

alter table public.chatbot_sessions
  add column if not exists no_atual text,
  add column if not exists tentativas integer not null default 0;

create index if not exists idx_chatbot_flows_ativos
  on public.chatbot_flows (organization_id, updated_at desc)
  where is_active;

create index if not exists idx_chatbot_sessions_esperando
  on public.chatbot_sessions (organization_id, conversation_id)
  where status = 'waiting_input';
