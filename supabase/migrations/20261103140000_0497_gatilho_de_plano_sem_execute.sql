-- ---- gatilho do aviso de plano não fica executável por authenticated (migration 0497) ----
-- `fn_emitir_plano_alterado` (migration 0493) é função de GATILHO de
-- `subscriptions`: o Postgres não confere EXECUTE de quem dispara o gatilho, só
-- de quem o cria. O `revoke … from public, anon` da 0493 deixava o EXECUTE
-- concedido a `authenticated` pelo default ACL — uma definer que escreve
-- (emit_event) ao alcance de qualquer usuário logado pela REST.
-- tests/invariants/hardening-definer-varredura.test.ts cobra isto.
-- Idempotente: revogar o que já foi revogado não faz nada.
revoke execute on function public.fn_emitir_plano_alterado() from public, anon, authenticated;
