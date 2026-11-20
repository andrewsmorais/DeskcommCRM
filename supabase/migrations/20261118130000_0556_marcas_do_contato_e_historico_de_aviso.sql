-- ============================================================================
-- 0556 — AS MARCAS DO CONTATO SÓ MUDAM PELA ROTA, E O TELEFONE DO AVISO É DO ADMIN
--
-- Auditoria de segurança de 18/11, achados 9 e 19.
--
-- 9: `is_personal` ("pessoal") e `ai_opt_out` ("sempre humano") só podem ser
-- mudadas por gerente/dono, pela rota auditada. Mas o PostgREST deixava um
-- atendente com a sessão dele dar UPDATE direto e desligar a marca, porque a
-- trava `fn_contato_colunas_de_controle` (0509) não olhava as duas colunas.
-- Agora olha, no INSERT e no UPDATE; a service role e as RPCs `security
-- definer` seguem passando (as rotas usam o client admin).
--
-- 19: a política de leitura do histórico de avisos de agendamento era
-- `manager`, e a linha guarda o telefone do dono. A tela já exige `admin`.
-- ============================================================================

create or replace function public.fn_contato_colunas_de_controle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_anonymized, false) or new.is_merged_into is not null
       or coalesce(new.is_personal, false) or coalesce(new.ai_opt_out, false) then
      raise exception 'colunas_de_controle_do_contato' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.is_blocked is distinct from new.is_blocked
     or old.blocked_reason is distinct from new.blocked_reason
     or old.blocked_at is distinct from new.blocked_at
     or old.is_anonymized is distinct from new.is_anonymized
     or old.anonymized_at is distinct from new.anonymized_at
     or old.is_merged_into is distinct from new.is_merged_into
     or old.merged_at is distinct from new.merged_at
     or old.is_personal is distinct from new.is_personal
     or old.ai_opt_out is distinct from new.ai_opt_out then
    raise exception 'colunas_de_controle_do_contato' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.fn_contato_colunas_de_controle() from public, anon, authenticated;

drop policy if exists leitura_entregas_de_aviso_de_agendamento on public.entregas_de_aviso_de_agendamento;
create policy leitura_entregas_de_aviso_de_agendamento
  on public.entregas_de_aviso_de_agendamento
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
  );
