-- 0488 — Preço contratado fica guardado na assinatura
--
-- Problema que isto resolve:
-- Hoje o MRR é calculado como `seats × preço atual em plans`. Quando os preços
-- da tabela `plans` mudam, o faturamento histórico de quem já era cliente muda
-- junto, porque nada registra o que a pessoa realmente contratou. Um cliente
-- que paga R$107 passaria a ser contado pelo preço novo.
--
-- Solução: cada assinatura passa a carregar o valor do ciclo no momento da
-- contratação. O MRR passa a somar esses valores, e a tabela `plans` volta a
-- ser só o catálogo de oferta.
--
-- Esta migration é aditiva: não apaga nem altera nenhuma coluna existente.


-- 1. Colunas novas em subscriptions ------------------------------------------

alter table public.subscriptions
  add column if not exists contracted_amount_cents integer,
  add column if not exists contracted_currency text not null default 'BRL',
  add column if not exists contracted_at timestamptz,
  add column if not exists price_source text;

comment on column public.subscriptions.contracted_amount_cents is
  'Valor total do ciclo cobrado na contratação, em centavos, já multiplicado pelos seats. Nulo em assinaturas anteriores a esta migration.';
comment on column public.subscriptions.contracted_currency is
  'Moeda do valor contratado. BRL hoje; a coluna existe para não travar venda em outra moeda.';
comment on column public.subscriptions.contracted_at is
  'Quando o valor acima foi fixado. Muda em upgrade/downgrade, não em renovação.';
comment on column public.subscriptions.price_source is
  'De onde veio o valor: catalogo (tabela plans), manual (negociado) ou retroativo (preenchido por esta migration).';

alter table public.subscriptions
  drop constraint if exists subscriptions_contracted_amount_positivo;
alter table public.subscriptions
  add constraint subscriptions_contracted_amount_positivo
  check (contracted_amount_cents is null or contracted_amount_cents >= 0);

alter table public.subscriptions
  drop constraint if exists subscriptions_price_source_valido;
alter table public.subscriptions
  add constraint subscriptions_price_source_valido
  check (price_source is null or price_source in ('catalogo', 'manual', 'retroativo'));

-- 2. Preenchimento retroativo -------------------------------------------------
-- Assinaturas que já existem recebem o valor calculado pelo preço de HOJE, que
-- é a melhor informação disponível. Ficam marcadas como 'retroativo' para que
-- se saiba que o número é uma reconstrução, não o valor realmente cobrado.

update public.subscriptions s
set
  contracted_amount_cents = case s.billing_cycle
    when 'yearly'    then coalesce(p.price_yearly,    p.price_monthly * 12) * greatest(s.seats, 1)
    when 'quarterly' then coalesce(p.price_quarterly, p.price_monthly * 3)  * greatest(s.seats, 1)
    else                  p.price_monthly * greatest(s.seats, 1)
  end,
  contracted_at = coalesce(s.created_at, now()),
  price_source = 'retroativo'
from public.plans p
where s.contracted_amount_cents is null
  and (
    s.plan_id = p.id
    or (s.plan_id is null and s.plan_type = p.slug)
  );

-- 3. Receita mensal normalizada ----------------------------------------------
-- O valor contratado é o do ciclo inteiro. Para somar MRR sem repetir a
-- conversão em cada consulta, a conta fica aqui, num lugar só.

create or replace function public.fn_assinatura_mrr_cents(
  p_amount_cents integer,
  p_billing_cycle text
)
returns integer
language sql
immutable
as $$
  select case
    when p_amount_cents is null then null
    when p_billing_cycle = 'yearly'    then round(p_amount_cents / 12.0)::integer
    when p_billing_cycle = 'quarterly' then round(p_amount_cents / 3.0)::integer
    else p_amount_cents
  end;
$$;

comment on function public.fn_assinatura_mrr_cents(integer, text) is
  'Converte o valor do ciclo contratado em receita mensal equivalente, em centavos.';

-- 4. Índice para as consultas de métrica -------------------------------------
-- O painel filtra por status e por canceled_at nos últimos 30 dias.

create index if not exists idx_subscriptions_status_canceled_at
  on public.subscriptions (status, canceled_at);

