-- 0502 — códigos de recuperação da MFA só com a MFA provada na sessão.
--
-- Os códigos de recuperação da MFA são a porta que DESLIGA o segundo fator:
-- `useRecoveryCode` (sem login, só e-mail + código) apaga todos os fatores TOTP
-- de quem apresentar um código válido. A tabela tinha só `recovery_codes_self`
-- (FOR ALL, `user_id = auth.uid()`) e GRANT ALL para anon e authenticated: a
-- sessão `aal1` — só a senha, antes do código do celular — gravava um
-- `code_hash` escolhido por ela e, em seguida, o resgatava; ou lia os hashes
-- (SHA-256 sem sal de 8 caracteres) para quebrá-los fora do ar. Achado de
-- cobertura da auditoria de 04/11/2026.
--
-- A restritiva abaixo exige a MFA provada (mesma casca da 0500) para QUALQUER
-- operação do login na tabela. Quem não tem fator segue igual (a função é
-- verdade para ele); o cadastro grava os códigos já em `aal2` e cai para a
-- service role se o token ainda não tiver sido trocado (`confirmMfaEnroll`);
-- o resgate e a regeneração já usam a service role / exigem `aal2`.
drop policy if exists recovery_codes_mfa_provada on public.user_recovery_codes;
create policy recovery_codes_mfa_provada on public.user_recovery_codes
  as restrictive for all to authenticated
  using ((select public.fn_rls_mfa_provada()))
  with check ((select public.fn_rls_mfa_provada()));
revoke all on table public.user_recovery_codes from anon;

notify pgrst, 'reload schema';
