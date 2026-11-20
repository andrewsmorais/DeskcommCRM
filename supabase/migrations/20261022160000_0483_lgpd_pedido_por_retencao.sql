-- 0483: pedido LGPD aberto pela exclusão no fim do prazo de exportação, e o
-- status `pending_review` que o código já gravava e o banco recusava.
--
-- 1. `lgpd_requests.source` ganha `retention`: é a origem do pedido de
--    anonimização da organização inteira que o cron
--    `app/api/v1/cron/exportacao-exclusao` abre 30 dias (+ folga) depois que o
--    acesso termina (lib/exportacao/exclusao.ts). Nenhuma das origens existentes
--    descrevia isso — e numa trilha LGPD a origem do pedido é o que responde
--    "quem mandou apagar".
--
-- 2. `lgpd_requests.status` ganha `pending_review`. O tipo
--    (lib/lgpd/types.ts), as duas rotas de listagem e os dois workers LGPD já
--    usavam esse valor; o CHECK não o aceitava. Cada UPDATE para
--    `pending_review` falhava sem ninguém ler o erro, e o pedido ficava preso
--    em `processing` — no caso do escopo `tenant` com contato que resistiu, a
--    organização já marcada como anonimizada e o pedido para sempre "em curso".
--
-- Só AMPLIA os dois vocabulários: nenhuma linha existente passa a violar a
-- constraint, então não há dado a corrigir antes. Idempotente — `drop
-- constraint if exists` + `add` recria sempre a mesma definição.
alter table public.lgpd_requests drop constraint if exists lgpd_requests_source_check;
alter table public.lgpd_requests add constraint lgpd_requests_source_check
  check (source = any (array['nuvemshop'::text, 'manual'::text, 'api'::text, 'support'::text, 'retention'::text]));

alter table public.lgpd_requests drop constraint if exists lgpd_requests_status_check;
alter table public.lgpd_requests add constraint lgpd_requests_status_check
  check (status = any (array['received'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'expired'::text, 'pending_review'::text]));
