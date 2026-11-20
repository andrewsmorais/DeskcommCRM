-- 0522 — Motivo de perda próprio para quem responde PARAR (vindo do produto
-- original, 0513 de lá).
--
-- A ingestão passa a fechar sozinha, como perdido, todo negócio aberto do
-- contato que pediu para não receber mensagens. O motivo é
-- `opted_out_of_messages` ("Pediu para não receber mensagens"): pedir silêncio
-- não é cancelar, então `requested_by_customer` diria algo que o cliente não
-- pediu. CONTA como perda (só a transferência, 0266, não conta).
--
-- O único lugar do banco que conhece os motivos canônicos é o array de
-- `fn_validate_lost_reason_required`; sem ele o trigger recusaria a perda com
-- 22023 `lost_reason_invalid` e o negócio ficaria aberto. Corpo idêntico ao da
-- 0266, com o motivo novo no fim do array. `create or replace` preserva os
-- grants. Aditiva e idempotente; o baseline traz a mesma mudança na última
-- definição da função.

create or replace function public.fn_validate_lost_reason_required() returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_canonical text[] := array['requested_by_customer','price','no_response','product_unavailable',
                              'cancelled_by_store','cancelled_by_customer','payment_failed','other',
                              'moved_to_another_pipeline','opted_out_of_messages'];
  v_pipeline_extra text[];
begin
  if new.status = 'lost' then
    if new.lost_reason is null or length(new.lost_reason) = 0 then
      raise exception 'lost_reason_required' using errcode = '22023';
    end if;

    select coalesce(
      array(
        select case when jsonb_typeof(e) = 'object'
                    then nullif(e ->> 'label', '')
                    else nullif(e #>> '{}', '') end
          from jsonb_array_elements(settings->'lost_reasons') as t(e)
      ), '{}'::text[]
    ) into v_pipeline_extra
    from public.crm_pipelines where id = new.pipeline_id;

    if not (new.lost_reason = any (v_canonical) or new.lost_reason = any (v_pipeline_extra)) then
      raise exception 'lost_reason_invalid: %', new.lost_reason using errcode = '22023';
    end if;
  end if;
  return new;
end$$;
