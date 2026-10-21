-- 0484 — Métricas do DONO da plataforma (painel /admin/metricas).
--
-- Tudo aqui é lido SÓ pelo servidor (service_role), depois de requirePlatformAdmin().
-- As funções são SECURITY DEFINER mas NÃO são executáveis por anon nem authenticated:
-- não entram na lista de funções chamáveis pela API pública.
--
-- "Empresa de teste": organizations.settings.excluir_das_metricas = true. O MRR, o
-- churn e a aquisição ignoram essas empresas por padrão (homologação e conta do dono).
-- O custo de IA NÃO as ignora: é dinheiro real gasto.

-- ── Marca as empresas que já sabemos que são teste ───────────────────────────
update public.organizations
   set settings = coalesce(settings, '{}'::jsonb) || '{"excluir_das_metricas": true}'::jsonb
 where slug = 'dandtecno' or slug like 'homologacao-%';

-- ── Custos da plataforma (preenchidos pelo dono) ─────────────────────────────
create table if not exists public.platform_custos_fixos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  categoria    text not null default 'outros',
  tipo         text not null default 'fixo_mensal'
               check (tipo in ('fixo_mensal', 'percentual_receita')),
  valor_cents  bigint not null default 0 check (valor_cents >= 0),
  basis_points integer not null default 0 check (basis_points between 0 and 10000),
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.platform_custos_fixos is
  'Custos da PLATAFORMA (servidor, domínio, e-mail, taxa do gateway). fixo_mensal usa valor_cents; percentual_receita usa basis_points (100 = 1%) sobre o MRR. Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated.';
alter table public.platform_custos_fixos enable row level security;
revoke all on public.platform_custos_fixos from anon, authenticated;

-- ── De onde veio cada empresa cliente ────────────────────────────────────────
create table if not exists public.org_aquisicao (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  origem          text not null default 'nao_informada',
  utm             jsonb not null default '{}'::jsonb,
  referrer        text,
  landing_url     text,
  created_at      timestamptz not null default now()
);
comment on table public.org_aquisicao is
  'Origem de aquisição da EMPRESA cliente (google_organico, anuncio, whatsapp, indicacao, direto...). Gravada no cadastro. Server-side only.';
alter table public.org_aquisicao enable row level security;
revoke all on public.org_aquisicao from anon, authenticated;

-- ── Base: assinaturas vigentes, com o MRR de cada uma em centavos ────────────
-- O preço de plans.price_* é POR ATENDENTE no período do ciclo:
-- mensal = por mês; trimestral = por trimestre; anual = por ano.
create or replace function public.fn_admin_assinaturas_vigentes(p_incluir_teste boolean default false)
returns table (
  organization_id uuid, plano text, ciclo text, seats integer,
  mrr_cents bigint, criada_em timestamptz, asaas_subscription_id text
)
language sql stable security definer set search_path = ''
as $$
  select s.organization_id,
         coalesce(p.slug, s.plan_type, 'desconhecido'),
         case when s.billing_cycle in ('yearly','annual','anual') then 'anual'
              when s.billing_cycle in ('quarterly','trimestral') then 'trimestral'
              else 'mensal' end,
         coalesce(s.seats, 0),
         round(coalesce(s.seats, 0) * case
           when s.billing_cycle in ('yearly','annual','anual') then coalesce(p.price_yearly, 0) / 12.0
           when s.billing_cycle in ('quarterly','trimestral') then coalesce(p.price_quarterly, 0) / 3.0
           else coalesce(p.price_monthly, 0) end)::bigint,
         s.created_at,
         s.asaas_subscription_id
    from public.subscriptions s
    join public.organizations o on o.id = s.organization_id
    left join public.plans p on p.id = s.plan_id
   where s.status in ('active', 'trialing')
     and s.canceled_at is null
     and (p_incluir_teste or not coalesce((o.settings ->> 'excluir_das_metricas')::boolean, false));
$$;

-- ── Receita, plano, ciclo, ticket, churn ─────────────────────────────────────
create or replace function public.fn_admin_metricas_receita(p_incluir_teste boolean default false)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with v as (select * from public.fn_admin_assinaturas_vigentes(p_incluir_teste)),
  tot as (
    select coalesce(sum(mrr_cents), 0)::bigint as mrr, count(*)::int as pagantes,
           coalesce(sum(seats), 0)::int as seats from v
  ),
  canc as (
    select count(*)::int as n
      from public.subscriptions s
      join public.organizations o on o.id = s.organization_id
     where s.canceled_at >= now() - interval '30 days'
       and (p_incluir_teste or not coalesce((o.settings ->> 'excluir_das_metricas')::boolean, false))
  ),
  novas as (select count(*)::int as n from v where criada_em >= now() - interval '30 days')
  select jsonb_build_object(
    'mrr_cents', (select mrr from tot),
    'arr_cents', (select mrr from tot) * 12,
    'pagantes', (select pagantes from tot),
    'atendentes_pagos', (select seats from tot),
    'ticket_medio_cents', case when (select pagantes from tot) = 0 then 0
                               else ((select mrr from tot) / (select pagantes from tot)) end,
    'novas_30d', (select n from novas),
    'cancelamentos_30d', (select n from canc),
    'churn_30d_pct', case when (select pagantes from tot) + (select n from canc) = 0 then 0
                          else round(100.0 * (select n from canc)
                                     / ((select pagantes from tot) + (select n from canc)), 1) end,
    'por_plano', coalesce((select jsonb_agg(jsonb_build_object(
        'plano', plano, 'empresas', empresas, 'atendentes', atendentes, 'mrr_cents', mrr)
        order by mrr desc)
      from (select plano, count(*)::int empresas, sum(seats)::int atendentes, sum(mrr_cents)::bigint mrr
              from v group by plano) a), '[]'::jsonb),
    'por_ciclo', coalesce((select jsonb_agg(jsonb_build_object(
        'ciclo', ciclo, 'empresas', empresas, 'mrr_cents', mrr) order by mrr desc)
      from (select ciclo, count(*)::int empresas, sum(mrr_cents)::bigint mrr
              from v group by ciclo) a), '[]'::jsonb)
  );
$$;

-- ── Crescimento diário ───────────────────────────────────────────────────────
create or replace function public.fn_admin_metricas_crescimento(p_dias integer default 90, p_incluir_teste boolean default false)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with dias as (
    select d::date as dia
      from generate_series((now() - make_interval(days => greatest(p_dias, 1) - 1))::date, now()::date, interval '1 day') d
  ),
  orgs as (
    select o.created_at::date dia, count(*) n from public.organizations o
     where p_incluir_teste or not coalesce((o.settings ->> 'excluir_das_metricas')::boolean, false)
     group by 1
  ),
  novas as (
    select s.created_at::date dia, count(*) n
      from public.subscriptions s join public.organizations o on o.id = s.organization_id
     where p_incluir_teste or not coalesce((o.settings ->> 'excluir_das_metricas')::boolean, false)
     group by 1
  ),
  canc as (
    select s.canceled_at::date dia, count(*) n
      from public.subscriptions s join public.organizations o on o.id = s.organization_id
     where s.canceled_at is not null
       and (p_incluir_teste or not coalesce((o.settings ->> 'excluir_das_metricas')::boolean, false))
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'dia', d.dia,
    'novas_empresas', coalesce(orgs.n, 0),
    'novas_assinaturas', coalesce(novas.n, 0),
    'cancelamentos', coalesce(canc.n, 0)) order by d.dia), '[]'::jsonb)
  from dias d
  left join orgs on orgs.dia = d.dia
  left join novas on novas.dia = d.dia
  left join canc on canc.dia = d.dia;
$$;

-- ── IA: custo, tokens, erros ─────────────────────────────────────────────────
create or replace function public.fn_admin_metricas_ia(p_dias integer default 30)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with l as (
    select * from public.llm_calls where created_at >= now() - make_interval(days => greatest(p_dias, 1))
  )
  select jsonb_build_object(
    'chamadas', (select count(*) from l),
    'custo_cents', coalesce((select sum(cost_cents) from l), 0),
    'tokens_entrada', coalesce((select sum(input_tokens) from l), 0),
    'tokens_saida', coalesce((select sum(output_tokens) from l), 0),
    'chamadas_com_erro', (select count(*) from l where error_code is not null),
    'latencia_media_ms', coalesce((select round(avg(latency_ms)) from l where latency_ms is not null), 0),
    'por_modelo', coalesce((select jsonb_agg(x order by (x ->> 'custo_cents')::numeric desc) from (
        select jsonb_build_object('modelo', model, 'chamadas', count(*), 'custo_cents', coalesce(sum(cost_cents), 0)) x
          from l group by model) m), '[]'::jsonb),
    'por_empresa', coalesce((select jsonb_agg(x order by (x ->> 'custo_cents')::numeric desc) from (
        select jsonb_build_object('organization_id', organization_id, 'chamadas', count(*), 'custo_cents', coalesce(sum(cost_cents), 0)) x
          from l group by organization_id order by coalesce(sum(cost_cents), 0) desc limit 20) m), '[]'::jsonb)
  );
$$;

-- ── Aquisição: de onde vêm os clientes ───────────────────────────────────────
create or replace function public.fn_admin_metricas_aquisicao(p_incluir_teste boolean default false)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('origem', origem, 'empresas', n) order by n desc), '[]'::jsonb)
  from (
    select coalesce(a.origem, 'nao_informada') origem, count(*)::int n
      from public.organizations o
      left join public.org_aquisicao a on a.organization_id = o.id
     where p_incluir_teste or not coalesce((o.settings ->> 'excluir_das_metricas')::boolean, false)
     group by 1
  ) t;
$$;

-- ── Lucro estimado do mês ────────────────────────────────────────────────────
-- lucro = MRR − custo de IA (30 dias) − custos fixos − taxas percentuais sobre o MRR.
-- É uma ESTIMATIVA: o custo de conversa da Meta é pago pelo cliente (Tech Provider) e
-- não entra aqui.
create or replace function public.fn_admin_metricas_lucro()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with r as (select (public.fn_admin_metricas_receita(false) ->> 'mrr_cents')::bigint mrr),
  ia as (select coalesce(sum(cost_cents), 0)::bigint c from public.llm_calls where created_at >= now() - interval '30 days'),
  fx as (select coalesce(sum(valor_cents), 0)::bigint c from public.platform_custos_fixos where ativo and tipo = 'fixo_mensal'),
  pc as (select coalesce(sum(basis_points), 0)::bigint bp from public.platform_custos_fixos where ativo and tipo = 'percentual_receita')
  select jsonb_build_object(
    'mrr_cents', (select mrr from r),
    'custo_ia_cents', (select c from ia),
    'custos_fixos_cents', (select c from fx),
    'taxas_percentuais_cents', round((select mrr from r) * (select bp from pc) / 10000.0)::bigint,
    'lucro_liquido_cents', (select mrr from r) - (select c from ia) - (select c from fx)
                           - round((select mrr from r) * (select bp from pc) / 10000.0)::bigint,
    'margem_pct', case when (select mrr from r) = 0 then null
      else round(100.0 * ((select mrr from r) - (select c from ia) - (select c from fx)
                           - round((select mrr from r) * (select bp from pc) / 10000.0)) / (select mrr from r), 1) end
  );
$$;

-- ── Só o servidor chama ──────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'fn_admin_assinaturas_vigentes(boolean)',
    'fn_admin_metricas_receita(boolean)',
    'fn_admin_metricas_crescimento(integer, boolean)',
    'fn_admin_metricas_ia(integer)',
    'fn_admin_metricas_aquisicao(boolean)',
    'fn_admin_metricas_lucro()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
