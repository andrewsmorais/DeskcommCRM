-- 0485 — forward-fix da 0484: o lucro estimado misturava moedas.
--
-- `llm_calls.cost_cents` é em centavos de DÓLAR (lib/money.ts, formatCentsUSD); o MRR
-- é em centavos de REAL. Subtrair um do outro dava um lucro maior que o verdadeiro.
-- Agora a função recebe o câmbio USD→BRL (padrão 5,50) e converte o custo de IA antes.
-- O câmbio é um número do dono, não uma cotação ao vivo: o painel o mostra ao lado.
--
-- Sem DROP: a versão sem argumento da 0484 continua existindo, só que agora delega
-- para a nova com o câmbio padrão, então não há mais caminho que some moedas diferentes.

create or replace function public.fn_admin_metricas_lucro(p_cambio_usd_brl numeric)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with r as (select (public.fn_admin_metricas_receita(false) ->> 'mrr_cents')::bigint mrr),
  ia as (
    select round(coalesce(sum(cost_cents), 0) * greatest(p_cambio_usd_brl, 0))::bigint c
      from public.llm_calls where created_at >= now() - interval '30 days'
  ),
  fx as (select coalesce(sum(valor_cents), 0)::bigint c from public.platform_custos_fixos where ativo and tipo = 'fixo_mensal'),
  pc as (select coalesce(sum(basis_points), 0)::bigint bp from public.platform_custos_fixos where ativo and tipo = 'percentual_receita'),
  tx as (select round((select mrr from r) * (select bp from pc) / 10000.0)::bigint c)
  select jsonb_build_object(
    'mrr_cents', (select mrr from r),
    'custo_ia_cents_brl', (select c from ia),
    'cambio_usd_brl', greatest(p_cambio_usd_brl, 0),
    'custos_fixos_cents', (select c from fx),
    'taxas_percentuais_cents', (select c from tx),
    'lucro_liquido_cents', (select mrr from r) - (select c from ia) - (select c from fx) - (select c from tx),
    'margem_pct', case when (select mrr from r) = 0 then null
      else round(100.0 * ((select mrr from r) - (select c from ia) - (select c from fx) - (select c from tx))
                 / (select mrr from r), 1) end
  );
$$;

create or replace function public.fn_admin_metricas_lucro()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select public.fn_admin_metricas_lucro(5.50::numeric);
$$;

revoke all on function public.fn_admin_metricas_lucro(numeric) from public, anon, authenticated;
grant execute on function public.fn_admin_metricas_lucro(numeric) to service_role;
revoke all on function public.fn_admin_metricas_lucro() from public, anon, authenticated;
grant execute on function public.fn_admin_metricas_lucro() to service_role;
