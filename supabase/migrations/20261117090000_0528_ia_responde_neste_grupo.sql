-- manifest: **A IA pode responder num grupo, por chave POR GRUPO** (trazido do produto original, 0653 de lá, #2729). `channel_session_groups.ia_responde boolean not null default false` — desligada, nada muda; ligada em Conexões › Grupos, o ingest do grupo pede o turno do agente e o motor deixa de pular o evento. O chatbot segue sem conduzir grupo. Idempotente; espelho no apêndice do `baseline.sql`.


-- 0653: a chave por grupo "Permitir que a IA responda neste grupo" (issue #2729).

-- ---- a chave por grupo (migration 0653, issue #2729) ----
--
-- A regra antiga era absoluta e estava certa na época: a 0482 separou
-- `message.group_received` de `message.received` justamente para que IA,
-- follow-up, campanhas e automações não enxergassem mensagem de grupo (o
-- defeito do PR #96, escuta dupla). O que ela não previa é o grupo de CLIENTES
-- com atendimento parcialmente manual: o operador escreve o preço, a IA
-- confirma o horário, e ninguém escreve nada para "bom dia" de 40 pessoas.
--
-- A peça é uma coluna por grupo, na MESMA linha que já guarda "este grupo
-- entra na inbox":
--
--   enabled      quem entra na inbox (e mexe no filtro do WhatsApp)
--   ia_responde  quem a IA pode responder  ← esta migration
--
-- Duas chaves em vez de uma porque são decisões diferentes com custos
-- diferentes: ligar o grupo é barulho de notificação para todo mundo, ligar a
-- IA é fala em nome da empresa. Por isso o default é `false` — o estado de
-- quem nunca tocou em nada continua sendo o comportamento de sempre —, e por
-- isso a chave da IA só existe para grupo JÁ LIGADO (sem linha ligada não há
-- mensagem na inbox, logo não há nada para responder; a rota devolve
-- `grupo_desligado`).
--
-- Quem lê é o ingest do grupo (`lib/grupos/ingest.ts`), que para a mensagem
-- inbound só se a chave estiver ligada, e o drain do motor
-- (`lib/agent-engine/edge/crm/drain.ts`), que deixa de pular o evento. As duas
-- leituras passam pela MESMA função (`grupoLiberaIa`, `=== true`) — é a
-- divergência entre a régua local e a tela que já custou caro (0213/0480).
-- Nada de proteção de envio é contornada: janela, ritmo, teto, silêncio
-- pós-handoff e elegibilidade moram no turno, depois desta decisão.
--
-- Sem backfill e sem nulo: `not null default false` é o comportamento de
-- hoje escrito na coluna, e linha gravada antes da migration recebe o default
-- na própria `alter table` — que também é o motivo de o comparador ser
-- `=== true` e não "truthy": nulo que aparecer algum dia significa "não sei se
-- o operador liberou", e não sei não responde.

alter table public.channel_session_groups
  add column if not exists ia_responde boolean not null default false;

comment on column public.channel_session_groups.ia_responde is
  'A chave POR GRUPO "Permitir que a IA responda neste grupo" (issue #2729). DESLIGADA por padrão, que é o comportamento de sempre: a mensagem de grupo entra na inbox pela fila do grupo (enabled) e a IA não responde. LIGADA, o ingest do grupo pede o turno do agente (mesmo evento ai_agent.dispatch_requested da conversa individual) e o motor deixa de pular o evento — as proteções de envio (janela de 24h, ritmo, teto diário, silêncio pós-handoff, elegibilidade) seguem valendo. Não mexe no filtro do WhatsApp nem existe para grupo fora da fila: sem linha ligada não há mensagem para responder.';

notify pgrst, 'reload schema';
