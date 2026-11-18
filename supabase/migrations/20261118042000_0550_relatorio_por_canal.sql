-- manifest: **Relatório por canal/conexão em Desempenho (trazido do produto original: 0590 de lá).** Função `fn_channel_metrics` (SECURITY INVOKER, então a RLS de `conversations` recorta quem olha): volume de conversas atribuídas, média da 1ª resposta HUMANA e conversas sem resposta, por número/conexão. Mesma régua da `fn_attendant_metrics`, só troca o `group by`. Aditiva e idempotente (`create or replace`).
create or replace function public.fn_channel_metrics(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null
) returns jsonb
language sql stable
set search_path = public
as $$
  with
  -- Conversas da organização na régua de ATRIBUIÇÃO da irmã (0037 §6.5).
  -- Sem janela AQUI de propósito: cada medida corta na SUA coluna — contagem e
  -- vazamento em `assigned_at`, 1ª resposta em `first_human_out`. É o mesmo
  -- desenho da irmã, cujo `ttfr` também não filtra `assigned_at`.
  conversas as (
    select
      c.channel_session_id as channel_session_id,
      c.channel as channel,
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
      and c.channel_session_id is not null
      and c.assigned_to_user_id is not null
      and (p_owner is null or c.assigned_to_user_id = p_owner)
  ),
  -- Uma linha por canal: volume, 1ª resposta humana e vazamento no MESMO
  -- `group by`, para a soma nunca divergir da média.
  canais as (
    select
      c.channel_session_id,
      -- O tipo é constante por sessão (0027/0368): `max()` agrupa uma coluna
      -- funcionalmente dependente, não inventa valor.
      max(c.channel) as channel,
      -- Critério 1: volume por canal, janela semiaberta em `assigned_at`.
      count(*) filter (
        where c.assigned_at >= p_from and c.assigned_at < p_to
      ) as conversations_handled,
      -- Critério 3: o vazamento — conversa da janela que NUNCA teve 1ª resposta
      -- humana. Conta aqui e só aqui; nunca mexe na média.
      count(*) filter (
        where c.assigned_at >= p_from and c.assigned_at < p_to
          and c.first_human_out is null
      ) as sem_resposta,
      -- Critérios 2 e 4: a MESMA fórmula da irmã — bot fora e `t1 <= t0`
      -- descartado. Sem par válido a média fica `null` (não medida), nunca 0.
      avg(extract(epoch from (c.first_human_out - c.first_in))) filter (
        where c.first_in is not null
          and c.first_human_out is not null
          and c.first_human_out > c.first_in
          and c.first_human_out >= p_from and c.first_human_out < p_to
      ) as avg_first_response_seconds
    from conversas c
    group by c.channel_session_id
  )
  select jsonb_build_object(
    'channels', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'channel_session_id', k.channel_session_id,
          'channel_name', coalesce(cs.phone_number, cs.display_name, cs.waha_session_name),
          'channel', k.channel,
          'is_archived', (cs.archived_at is not null),
          'conversations_handled', k.conversations_handled,
          'avg_first_response_seconds', k.avg_first_response_seconds,
          'sem_resposta', k.sem_resposta
        ) order by k.conversations_handled desc, k.channel_session_id
      )
      from canais k
      left join public.channel_sessions cs on cs.id = k.channel_session_id
      -- Critério 5: canal sem atividade na janela não é linha, é ruído — a
      -- resposta sem dado é `[]` e a tela diz "Sem atividade no período".
      where k.conversations_handled > 0
         or k.sem_resposta > 0
         or k.avg_first_response_seconds is not null
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.fn_channel_metrics(uuid, timestamptz, timestamptz, uuid) from public;
revoke execute on function public.fn_channel_metrics(uuid, timestamptz, timestamptz, uuid) from anon;
grant execute on function public.fn_channel_metrics(uuid, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

-- 0590
