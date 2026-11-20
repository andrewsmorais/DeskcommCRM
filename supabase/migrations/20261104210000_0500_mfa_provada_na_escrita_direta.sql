-- 0500 — a MFA provada vale também para a escrita direta pelo PostgREST.
--
-- `requireRole` recusa (403 mfa_required) a sessão `aal1` de quem TEM segundo
-- fator, mas isso só vale para as rotas do app. O navegador tem a anon key e o
-- JWT da própria sessão, e a RLS das tabelas de organização só olhava papel e
-- vínculo: com a senha roubada e sem o celular, a sessão `aal1` fazia pela REST
-- as escritas de admin que a tela recusava (auditoria de 04/11/2026).
--
-- A régua é `fn_session_mfa_proven()` (já usada pelas RPCs sensíveis): verdade
-- quando a sessão é `aal2` OU quando o usuário não tem fator verificado — quem
-- ainda não cadastrou segue operando, como nas rotas. Ela entra como política
-- RESTRITIVA de escrita, instalada pelo MESMO enumerador de catálogo das travas
-- de suporte (`fn_aplicar_travas_de_suporte`), para que toda tabela de
-- organização — inclusive as que módulos criarem depois — receba as duas.
-- Leitura fica de fora: a tela de desafio da MFA precisa ler.

-- A política roda com o papel de quem consulta (`authenticated`), e
-- `fn_session_mfa_proven` é revogada desse papel de propósito (e a revogação é
-- REAPLICADA a cada update.sh, num bloco anterior do baseline). Em vez de
-- conceder a ela — o que abriria, a cada atualização, uma janela em que a
-- política chama uma função que o papel não pode executar —, a política chama
-- esta casca, que é só dela e roda como dona. Responde só sobre a própria
-- sessão; expor como RPC não vaza nada.
create or replace function public.fn_rls_mfa_provada()
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_session_mfa_proven();
$$;
revoke execute on function public.fn_rls_mfa_provada() from public, anon;
grant execute on function public.fn_rls_mfa_provada() to authenticated, service_role;

create or replace function public.fn_aplicar_travas_de_suporte()
returns void
language plpgsql
set search_path = public
as $f$
declare r record; v_col text;
begin
 for r in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity
 and (exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped) or c.relname='organizations')
 loop
 v_col:=case when r.relname='organizations' then 'id' else 'organization_id' end;
 if not (has_table_privilege('authenticated',r.oid,'insert') or has_table_privilege('authenticated',r.oid,'update') or has_table_privilege('authenticated',r.oid,'delete')) then
   execute format('drop policy if exists support_write_insert on public.%I',r.relname);
   execute format('drop policy if exists support_write_update on public.%I',r.relname);
   execute format('drop policy if exists support_write_delete on public.%I',r.relname);
   execute format('drop policy if exists mfa_write_insert on public.%I',r.relname);
   execute format('drop policy if exists mfa_write_update on public.%I',r.relname);
   execute format('drop policy if exists mfa_write_delete on public.%I',r.relname);
   continue; -- tabela server-only mantém ZERO policies, contrato mais restritivo
 end if;
 execute format('drop policy if exists support_write_insert on public.%I',r.relname);
 execute format('create policy support_write_insert on public.%I as restrictive for insert to authenticated with check (public.fn_support_write_allowed(%I))',r.relname,v_col);
 execute format('drop policy if exists support_write_update on public.%I',r.relname);
 execute format('create policy support_write_update on public.%I as restrictive for update to authenticated using (public.fn_support_write_allowed(%I)) with check (public.fn_support_write_allowed(%I))',r.relname,v_col,v_col);
 execute format('drop policy if exists support_write_delete on public.%I',r.relname);
 execute format('create policy support_write_delete on public.%I as restrictive for delete to authenticated using (public.fn_support_write_allowed(%I))',r.relname,v_col);
 -- (0500) A MFA PROVADA vale para a escrita DIRETA também, não só para as rotas.
 -- `(select ...)` é avaliado uma vez por comando, não por linha.
 execute format('drop policy if exists mfa_write_insert on public.%I',r.relname);
 execute format('create policy mfa_write_insert on public.%I as restrictive for insert to authenticated with check ((select public.fn_rls_mfa_provada()))',r.relname);
 execute format('drop policy if exists mfa_write_update on public.%I',r.relname);
 execute format('create policy mfa_write_update on public.%I as restrictive for update to authenticated using ((select public.fn_rls_mfa_provada())) with check ((select public.fn_rls_mfa_provada()))',r.relname);
 execute format('drop policy if exists mfa_write_delete on public.%I',r.relname);
 execute format('create policy mfa_write_delete on public.%I as restrictive for delete to authenticated using ((select public.fn_rls_mfa_provada()))',r.relname);
 end loop;
end $f$;

revoke execute on function public.fn_aplicar_travas_de_suporte() from public, anon, authenticated, service_role;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

notify pgrst, 'reload schema';
