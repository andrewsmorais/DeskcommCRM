-- 0523 — Passar a conversa de um agente de IA para outro (vindo do produto
-- original, 9064 de lá).
--
-- A ferramenta `transfer_to_agent` grava na conversa o agente escolhido
-- (`active_intent = 'transferido'`, a mesma régua do chatbot) e deixa a trilha em
-- `ai_router_decisions`: desfecho próprio `transferred` (nunca `reclassified`,
-- que é o do classificador), `origem` (`classificador`/`acao`), de qual agente
-- (`agente_anterior_id`), por quê (`motivo`, vocabulário FECHADO — a tabela tem
-- contrato de "sem PII" desde a 0085) e quem pediu (`solicitado_por`).
--
-- Aditiva e idempotente; linhas antigas ficam `origem = 'classificador'`, que é
-- a verdade. Espelho no apêndice do baseline.

alter table public.ai_router_decisions
  drop constraint if exists ai_router_decisions_outcome_check;
alter table public.ai_router_decisions
  add constraint ai_router_decisions_outcome_check
  check (outcome in ('classified', 'sticky', 'reclassified', 'fallback', 'no_match', 'classifier_failed', 'transferred'));

alter table public.ai_router_decisions
  add column if not exists origem text not null default 'classificador';
alter table public.ai_router_decisions
  drop constraint if exists ai_router_decisions_origem_check;
alter table public.ai_router_decisions
  add constraint ai_router_decisions_origem_check
  check (origem in ('classificador', 'acao'));

alter table public.ai_router_decisions
  add column if not exists agente_anterior_id uuid references public.ai_agents(id) on delete set null;

alter table public.ai_router_decisions
  add column if not exists motivo text;
alter table public.ai_router_decisions
  drop constraint if exists ai_router_decisions_motivo_check;
alter table public.ai_router_decisions
  add constraint ai_router_decisions_motivo_check
  check (motivo is null or motivo in ('pedido_do_agente', 'pedido_do_operador', 'regra_de_automacao'));

-- Quem pediu, quando foi uma pessoa. Sem FK de propósito: trilha append-only
-- não pode mudar quando uma conta é apagada.
alter table public.ai_router_decisions
  add column if not exists solicitado_por uuid;
