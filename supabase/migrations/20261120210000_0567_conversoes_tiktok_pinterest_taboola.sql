-- Venda devolvida ao TikTok, ao Pinterest e ao Taboola (pedido do dono, 20/11/2026).
--
-- 1. `ad_platform_connections` aceita as três plataformas novas. A credencial é
--    a mesma forma da Meta: `dataset_id` (código do pixel do TikTok, id da conta
--    de anúncios do Pinterest, NOME do evento do Taboola) + token cifrado
--    (o Taboola não usa token). Os transportes moram em
--    `lib/plataformas-de-anuncio/{tiktok,pinterest,taboola}/conversions.ts`.
-- 2. `fn_vendas_por_campanha` passa a reconhecer o contato marcado com
--    `tiktok_ads` / `pinterest_ads` / `taboola_ads` (o link rastreável agora
--    grava o código de clique de cada uma — `ttclid`, `epik`, `tblci`).
--
-- Idempotente: a constraint sai e volta com a lista nova; a função é
-- `create or replace`. Nenhuma linha existente viola a lista nova (ela só cresce).
alter table public.ad_platform_connections
  drop constraint if exists ad_platform_connections_platform_conhecida;
alter table public.ad_platform_connections
  add constraint ad_platform_connections_platform_conhecida
  check (platform in ('meta_ads', 'google_ads', 'tiktok_ads', 'pinterest_ads', 'taboola_ads'));

create or replace function public.fn_vendas_por_campanha(p_org uuid, p_desde timestamptz, p_ate timestamptz)
returns table(
  plataforma text,
  campanha text,
  contatos bigint,
  negocios bigint,
  avancaram bigint,
  vendas bigint,
  faturamento_cents bigint
)
language sql stable security definer set search_path = public as $$
  with base as (
    select c.id, c.source_metadata as sm
      from public.contacts c
     where c.organization_id = p_org
       and c.created_at >= p_desde and c.created_at < p_ate
       and c.is_merged_into is null
       and coalesce(c.kind, 'person') = 'person'
  ), clique as (
    select distinct on (r.contact_id) r.contact_id,
           lower(btrim(coalesce(r.utm->>'utm_source', ''))) as fonte,
           nullif(btrim(r.utm->>'utm_campaign'), '') as campanha
      from public.meta_ads_click_refs r
      join base b on b.id = r.contact_id
     where r.organization_id = p_org
     order by r.contact_id, r.created_at
  ), clique_google as (
    select distinct on (g.contact_id) g.contact_id,
           nullif(btrim(g.query_raw->>'utm_campaign'), '') as campanha
      from public.google_ads_click_refs g
      join base b on b.id = g.contact_id
     where g.organization_id = p_org
     order by g.contact_id, g.created_at
  ), origem as (
    select b.id,
           case
             when cl.contact_id is not null then
               case
                 when cl.fonte in ('facebook', 'fb', 'instagram', 'ig', 'meta', 'meta_ads', 'facebook_ads') then 'meta'
                 when cl.fonte in ('google', 'google_ads', 'googleads', 'adwords', 'gads', 'youtube') then 'google'
                 when cl.fonte in ('tiktok', 'tiktok_ads', 'tiktokads') then 'tiktok'
                 when cl.fonte in ('pinterest', 'pinterest_ads', 'pin') then 'pinterest'
                 when cl.fonte in ('taboola', 'taboola_ads') then 'taboola'
                 -- Sem UTM reconhecível, vale a plataforma do código de clique
                 -- que o link guardou e o contato recebeu (0567).
                 when b.sm->>'ad_platform' = 'tiktok_ads' then 'tiktok'
                 when b.sm->>'ad_platform' = 'pinterest_ads' then 'pinterest'
                 when b.sm->>'ad_platform' = 'taboola_ads' then 'taboola'
                 else 'outra'
               end
             when cg.contact_id is not null then 'google'
             when b.sm->>'ad_platform' = 'meta_ads' then 'meta'
             when b.sm->>'ad_platform' = 'google_ads' then 'google'
             when b.sm->>'ad_platform' = 'tiktok_ads' then 'tiktok'
             when b.sm->>'ad_platform' = 'pinterest_ads' then 'pinterest'
             when b.sm->>'ad_platform' = 'taboola_ads' then 'taboola'
             else 'sem_origem'
           end as plataforma,
           coalesce(
             cl.campanha,
             cg.campanha,
             h.campaign_name,
             nullif(btrim(b.sm->>'ad_title'), ''),
             case when nullif(b.sm->>'ad_id', '') is not null then 'Anúncio ' || (b.sm->>'ad_id') end
           ) as campanha
      from base b
      left join clique cl on cl.contact_id = b.id
      left join clique_google cg on cg.contact_id = b.id
      left join public.ad_hierarchy_cache h
        on h.organization_id = p_org
       and h.platform = b.sm->>'ad_platform'
       and h.ad_id = b.sm->>'ad_id'
  ), etapa_inicial as (
    select s.pipeline_id, min(s.position) as pos
      from public.crm_stages s
     where s.organization_id = p_org and not s.is_archived
     group by s.pipeline_id
  ), negocios as (
    select l.contact_id,
           count(*) as n,
           count(*) filter (where l.status = 'won' or s.position > ei.pos) as avancaram,
           count(*) filter (where l.status = 'won') as vendas,
           coalesce(sum(l.value_cents) filter (where l.status = 'won'), 0) as faturamento
      from public.crm_leads l
      join base b on b.id = l.contact_id
      left join public.crm_stages s on s.id = l.stage_id and s.organization_id = p_org
      left join etapa_inicial ei on ei.pipeline_id = l.pipeline_id
     where l.organization_id = p_org
     group by l.contact_id
  )
  select o.plataforma,
         case when o.plataforma = 'sem_origem' then null else coalesce(o.campanha, '(sem nome)') end,
         count(*)::bigint,
         coalesce(sum(n.n), 0)::bigint,
         coalesce(sum(n.avancaram), 0)::bigint,
         coalesce(sum(n.vendas), 0)::bigint,
         coalesce(sum(n.faturamento), 0)::bigint
    from origem o
    left join negocios n on n.contact_id = o.id
   group by 1, 2;
$$;
revoke all on function public.fn_vendas_por_campanha(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_vendas_por_campanha(uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
