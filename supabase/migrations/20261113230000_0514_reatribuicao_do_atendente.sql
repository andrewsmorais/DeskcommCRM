-- 0514 — reatribuição automática (13/11/2026).
--
-- Paridade com a Umbler Talk: cada atendente tem uma regra de reatribuição —
-- "desligada" (padrão), "offline" (quando o contato escreve e o atendente está
-- indisponível, ele sai da conversa) ou "sempre" (sai a cada mensagem nova do
-- contato). O que acontece depois é da empresa (Configurações › Conversas):
-- a conversa volta para a fila ou um chatbot começa. Quem age é o worker,
-- consumindo `message.received` (lib/conversas/reatribuicao.handler.ts).
-- Idempotente.

-- ---- reatribuição do atendente (migration 0514) ----
alter table public.attendant_availability
  add column if not exists reatribuicao text not null default 'desligada'
  check (reatribuicao in ('desligada', 'offline', 'sempre'));
comment on column public.attendant_availability.reatribuicao is
  'Reatribuição automática (paridade Umbler): desligada | offline (sai da conversa se o contato escreve e ele está indisponível) | sempre. Migration 0514.';
