-- 0508 — troca de plano pelo próprio cliente (Essencial ↔ Impulso).
--
-- Regra do mercado (termos da Umbler Talk, a referência do produto): quem
-- SOBE de plano paga a diferença proporcional aos dias que faltam e recebe o
-- plano novo na hora em que paga; quem DESCE fica com o plano atual até o fim
-- do período já pago, e o próximo período vem com o valor menor. Nada é
-- devolvido. O Escala segue sob consulta (não passa por aqui).
--
-- A troca pedida mora na própria assinatura, numa linha por organização:
--   troca_plano        — para qual plano (slug do catálogo comercial)
--   troca_tipo         — 'upgrade' (espera o pagamento da diferença) ou
--                        'downgrade' (espera o fim do período)
--   troca_efetiva_em   — downgrade: quando vale (fim do período pago)
--   troca_pagamento_id — upgrade: a cobrança avulsa do Asaas. É a IDENTIDADE
--                        que o webhook da página de vendas usa para aplicar a
--                        troca — nunca o externalReference, que é texto livre
--   troca_valor_cents  — upgrade: a diferença cobrada
--   troca_link         — upgrade: o link de pagamento do Asaas
--   troca_pedida_em    — quando foi pedida
--
-- Só o servidor escreve (a tabela já não tem UPDATE para authenticated); o
-- membro lê pela policy de leitura que já existe. Aditiva e idempotente.

alter table public.subscriptions add column if not exists troca_plano text;
alter table public.subscriptions add column if not exists troca_tipo text;
alter table public.subscriptions add column if not exists troca_efetiva_em timestamptz;
alter table public.subscriptions add column if not exists troca_pagamento_id text;
alter table public.subscriptions add column if not exists troca_valor_cents integer;
alter table public.subscriptions add column if not exists troca_link text;
alter table public.subscriptions add column if not exists troca_pedida_em timestamptz;

-- Uma troca pela metade (tipo sem plano, ou o contrário) não tem dono: limpa
-- antes das constraints, para o update.sh de um banco qualquer não quebrar.
update public.subscriptions
   set troca_plano = null, troca_tipo = null, troca_efetiva_em = null,
       troca_pagamento_id = null, troca_valor_cents = null, troca_link = null,
       troca_pedida_em = null
 where (troca_plano is null) <> (troca_tipo is null)
    or (troca_tipo is not null and troca_tipo not in ('upgrade', 'downgrade'))
    or (troca_plano is not null and troca_plano not in ('essencial', 'impulso'))
    or (troca_valor_cents is not null and troca_valor_cents < 0);

alter table public.subscriptions drop constraint if exists subscriptions_troca_coerente;
alter table public.subscriptions
  add constraint subscriptions_troca_coerente check (
    (troca_plano is null) = (troca_tipo is null)
    and (troca_tipo is null or troca_tipo in ('upgrade', 'downgrade'))
    and (troca_plano is null or troca_plano in ('essencial', 'impulso'))
    and (troca_valor_cents is null or troca_valor_cents >= 0)
  );

create unique index if not exists idx_subscriptions_troca_pagamento
  on public.subscriptions (troca_pagamento_id)
  where troca_pagamento_id is not null;

comment on column public.subscriptions.troca_plano is
  'Troca de plano pedida pelo cliente (0508): o plano de destino. Nulo = nenhuma troca em andamento.';
comment on column public.subscriptions.troca_pagamento_id is
  'Upgrade: id da cobrança avulsa da diferença no Asaas. O webhook aplica a troca por este id, nunca pelo externalReference.';
comment on column public.subscriptions.troca_efetiva_em is
  'Downgrade: quando o plano menor passa a valer (fim do período já pago).';
