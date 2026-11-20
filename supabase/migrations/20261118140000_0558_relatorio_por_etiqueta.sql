-- manifest: **Relatório por etiqueta em Desempenho.** Função `fn_tag_metrics` (SECURITY INVOKER, então a RLS de `conversations` recorta quem olha): volume de conversas atribuídas, média E MEDIANA da 1ª resposta HUMANA e conversas sem resposta, por etiqueta da conversa. Mesma régua da `fn_channel_metrics` (0550), só troca o `group by` por `unnest(tags)`. Uma conversa com várias etiquetas conta em cada uma (por isso a tela não soma). Aditiva e idempotente (`create or replace`).
create or replace function public.fn_tag_metrics(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null
) returns jsonb
language sql stable
set search_path = public
as $$
  with
  -- Mesma régua de ATRIBUIÇÃO da `fn_channel_metrics`: cada medida corta na SUA
  -- coluna (contagem e vazamento em `assigned_at`, 1ª resposta em `first_human_out`).
  conversas as (
    select
      c.tags as tags,
      c.assigned_at as assigned_at,
      fr.first_in,
      fr.first_human_out
    from public.conversations c
    cross join lateral (
      select
        min(m.sent_at) filter (where m.direction = 'inbound') as first_in,
        min(m.sent_at) filter (
          where m.direction = 'outbound' and m.sent_by_user_id is not null
        ) as first_human_out
      from public.messages m
      where m.conversation_id = c.id
    ) fr
    where c.organization_id = p_org
      and c.assigned_to_user_id is not null
      and coalesce(array_length(c.tags, 1), 0) > 0
      and (p_owner is null or c.assigned_to_user_id = p_owner)
  ),
  -- Uma linha por etiqueta, depois de desdobrar o array. A etiqueta já nasce
  -- normalizada (caixa baixa) na gravação; `lower(trim())` aqui só protege dado antigo.
  por_etiqueta as (
    select
      lower(btrim(t.tag)) as tag,
      c.assigned_at,
      c.first_in,
      c.first_human_out
    from conversas c
    cross join lateral unnest(c.tags) as t(tag)
    where btrim(t.tag) <> ''
  ),
  etiquetas as (
    select
      e.tag,
      count(*) filter (
        where e.assigned_at >= p_from and e.assigned_at < p_to
      ) as conversations_handled,
      count(*) filter (
        where e.assigned_at >= p_from and e.assigned_at < p_to
          and e.first_human_out is null
      ) as sem_resposta,
      avg(extract(epoch from (e.first_human_out - e.first_in))) filter (
        where e.first_in is not null
          and e.first_human_out is not null
          and e.first_human_out > e.first_in
          and e.first_human_out >= p_from and e.first_human_out < p_to
      ) as avg_first_response_seconds,
      -- A MEDIANA: a média some com um caso que ficou dias sem resposta; a
      -- mediana diz o que acontece com a conversa típica. Mesmo filtro da média.
      percentile_cont(0.5) within group (
        order by extract(epoch from (e.first_human_out - e.first_in))
      ) filter (
        where e.first_in is not null
          and e.first_human_out is not null
          and e.first_human_out > e.first_in
          and e.first_human_out >= p_from and e.first_human_out < p_to
      ) as median_first_response_seconds
    from por_etiqueta e
    group by e.tag
  )
  select jsonb_build_object(
    'tags', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tag', k.tag,
          'conversations_handled', k.conversations_handled,
          'avg_first_response_seconds', k.avg_first_response_seconds,
          'median_first_response_seconds', k.median_first_response_seconds,
          'sem_resposta', k.sem_resposta
        ) order by k.conversations_handled desc, k.tag
      )
      from etiquetas k
      -- Etiqueta sem atividade na janela não é linha, é ruído.
      where k.conversations_handled > 0
         or k.sem_resposta > 0
         or k.avg_first_response_seconds is not null
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.fn_tag_metrics(uuid, timestamptz, timestamptz, uuid) from public;
revoke execute on function public.fn_tag_metrics(uuid, timestamptz, timestamptz, uuid) from anon;
grant execute on function public.fn_tag_metrics(uuid, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
