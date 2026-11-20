-- Vendas por campanha: de qual campanha (Meta, Google Ads, TikTok, Pinterest)
-- vieram os contatos do período, e o que eles viraram no funil.
--
-- A ORIGEM de cada contato, nesta ordem (primeiro toque):
--   1. o primeiro clique no link rastreável (`meta_ads_click_refs`, que guarda a
--      UTM de QUALQUER origem — o nome é histórico): `utm_source` diz a
--      plataforma e `utm_campaign` a campanha. TikTok e Pinterest preenchem a
--      campanha sozinhos (`__CAMPAIGN_NAME__`, `{campaignname}`);
--   2. o clique do Google Ads (`google_ads_click_refs`, gclid);
--   3. o anúncio de clique para o WhatsApp gravado no contato
--      (`source_metadata.ad_platform/ad_id`), com o nome da campanha do
--      `ad_hierarchy_cache` quando já foi lido, ou o título do anúncio.
-- Contato sem nenhum desses fica em `sem_origem` — a linha que mostra quanto
-- do atendimento NÃO está sendo rastreado.
--
-- O período recorta os CONTATOS que chegaram nele (coorte); negócios e vendas
-- desses contatos contam em qualquer data. "Avançaram" = negócio ganho ou que
-- saiu da primeira etapa do funil dele.
--
-- Só service_role: o `p_org` vem da sessão, resolvido no servidor.
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
                 else 'outra'
               end
             when cg.contact_id is not null then 'google'
             when b.sm->>'ad_platform' = 'meta_ads' then 'meta'
             when b.sm->>'ad_platform' = 'google_ads' then 'google'
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
