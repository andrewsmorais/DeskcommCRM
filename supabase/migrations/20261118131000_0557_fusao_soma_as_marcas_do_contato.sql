-- ============================================================================
-- 0557 — JUNTAR FICHAS SOMA AS MARCAS "PESSOAL" E "SEMPRE HUMANO"
--
-- Auditoria de segurança de 18/11, achado 11. As marcas moram na ficha. Quando
-- duas fichas viravam uma, a marca da que SAÍA ficava para trás: o contato
-- passava a ser atendido pela IA, ou a receber automação, como se nunca tivesse
-- sido marcado.
--
-- Um gatilho (e não uma cópia nova de `fn_mesclar_contatos`, que já tem várias
-- definições no baseline) soma as marcas na ficha que fica, na MESMA transação
-- em que o `is_merged_into` é gravado. Só dispara quando a ficha que sai tem
-- alguma marca.
-- ============================================================================

create or replace function public.fn_fusao_soma_marcas_do_contato()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- O que sai da ficha entrega as marcas à que fica: "pessoal" e "sempre
  -- humano" nunca se perdem numa fusão. `ai_opt_out` já implica `force_human`.
  update public.contacts
     set is_personal = is_personal or coalesce(new.is_personal, false),
         ai_opt_out  = ai_opt_out  or coalesce(new.ai_opt_out, false),
         force_human = force_human or coalesce(new.ai_opt_out, false)
   where organization_id = new.organization_id
     and id = new.is_merged_into
     and (
       (coalesce(new.is_personal, false) and not is_personal)
       or (coalesce(new.ai_opt_out, false) and (not ai_opt_out or not force_human))
     );
  return null;
end $$;
revoke execute on function public.fn_fusao_soma_marcas_do_contato() from public, anon, authenticated;

drop trigger if exists trg_fusao_soma_marcas_do_contato on public.contacts;
create trigger trg_fusao_soma_marcas_do_contato
  after update of is_merged_into on public.contacts
  for each row
  when (old.is_merged_into is null and new.is_merged_into is not null
        and (new.is_personal or new.ai_opt_out))
  execute function public.fn_fusao_soma_marcas_do_contato();
