-- 0501 — fila do motor e fila de exclusão só pelo servidor; o ramo de
-- plataforma só escreve com escopo 'full' e a MFA que a política exige.
--
-- Achados da auditoria de segurança de 04/11/2026, reproduzidos num banco
-- fresco com o baseline e o JWT de quem os explora. Idempotente.

-- ── 1. tabelas do motor: membro lê, só o servidor escreve ──────────────────
-- `job_queue`, `cron_jobs`, `llm_calls`, `pacing_ledger`, `send_ledger`,
-- `outbound_copies`, `storage_redaction_queue` e o texto de retomada
-- (`reentry_template_versions`/`_pointers`) recebiam a política genérica
-- "é da sua organização" FOR ALL, e `authenticated` mantinha INSERT/UPDATE/
-- DELETE. A auditoria de 04/11/2026 reproduziu, com o JWT de um LEITOR:
--   - uma linha em `cron_jobs` que o worker copiou para a fila e mandou pelo
--     WhatsApp da empresa, ao contato escolhido, o texto escolhido;
--   - jobs com prioridade -32768 passando à frente de outras organizações;
--   - apagar `llm_calls` (zerava o gasto que o teto de IA mede) e
--     `pacing_ledger` (zerava o ritmo anti-banimento);
--   - uma linha em `storage_redaction_queue` que fez o dreno (service role)
--     apagar o logo da instalação e a mídia de OUTRA organização.
-- Nenhum escritor legítimo usa o login: o motor grava pelo pool, as rotas e
-- crons com a service role, e as funções do banco que alimentam as filas são
-- SECURITY DEFINER. A única rota que gravava com a sessão
-- (`leads/[id]/reactivation`) passa a gravar pelo servidor neste mesmo PR.
-- `fn_proteger_tabelas_de_organizacao` só age em tabela com RLS desligada,
-- então não devolve a política FOR ALL; e `fn_aplicar_travas_de_suporte`,
-- chamada no fim, tira as restritivas de escrita, que ficam sem objeto.
do $$
declare t text; p record;
begin
  foreach t in array array['job_queue','cron_jobs','llm_calls','pacing_ledger',
                           'send_ledger','outbound_copies','storage_redaction_queue',
                           'reentry_template_versions','reentry_template_pointers'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t
                and permissive = 'PERMISSIVE' and cmd in ('ALL','INSERT','UPDATE','DELETE') loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t || '_leitura', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 2. o ramo de plataforma respeita escopo e MFA ───────────────────────────
-- `fn_is_platform_admin()` é verdade para qualquer linha não revogada de
-- `platform_admins` e entra com OR em 65 políticas de escrita. Um admin de
-- plataforma de escopo 'support_readonly' — sem sessão de suporte, que é onde o
-- escopo era respeitado — se fez admin de uma organização alheia, emitiu token
-- de API para ela e rebaixou o dono, pela REST; e a sessão aal1 de um admin com
-- `mfa_required` fazia o mesmo. Em vez de reescrever as 65 políticas, a regra
-- entra em `fn_support_write_allowed`, que as restritivas `support_write_*` já
-- aplicam a TODA tabela de organização (e que as RPCs de escrita já chamam):
-- fora das organizações de que é membro, quem não é 'full' (ou não provou a MFA
-- exigida) não escreve. Leitura não muda. A mesma função passa a deixar
-- só-leitura, para o login, a organização que a plataforma SUSPENDEU (a
-- suspensão era cobrada só na tela do /app).
create or replace function public.fn_support_write_allowed(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $f$
 select coalesce((select case when (s->>'organization_id')::uuid is distinct from p_org then true
 else s->>'status'='active' and s->>'access_mode'='full' end
 from (select public.fn_support_context() s) c where s is not null),true)
 -- (0501) O ramo de plataforma das políticas (`or fn_is_platform_admin()`) só
 -- escreve numa organização de que a pessoa NÃO é membro quando o escopo é
 -- 'full' e a sessão cumpre a MFA que `platform_admins.mfa_required` pede.
 and not exists (
  select 1 from public.platform_admins p
   where p.user_id = auth.uid() and p.revoked_at is null
     and (p.scope <> 'full' or (p.mfa_required and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'))
     and not exists (select 1 from public.user_organizations u
                      where u.user_id = auth.uid() and u.organization_id = p_org and u.revoked_at is null))
 -- (0501) Organização SUSPENSA pela plataforma fica só-leitura para o login
 -- (a REST também, não só a tela e as rotas). O servidor (sem auth.uid())
 -- segue: a ingestão não pode perder mensagem por causa da suspensão. Leitura
 -- não muda — é por ela que o titular e o admin seguem vendo os próprios dados.
 and not (auth.uid() is not null
          and exists (select 1 from public.organizations o where o.id = p_org and o.status = 'suspended')
          and not public.fn_is_platform_admin());
$f$;
revoke all on function public.fn_support_write_allowed(uuid) from public, anon;
grant execute on function public.fn_support_write_allowed(uuid) to authenticated, service_role;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

notify pgrst, 'reload schema';
