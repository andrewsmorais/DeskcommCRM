-- manifest: **Códigos de recuperação da verificação em duas etapas: só o servidor lê e grava, e os da forma antiga saem** (trazido do produto original, 0755 + 0759). `user_recovery_codes` deixa de conceder privilégios a `anon` e `authenticated`, e a policy `recovery_codes_self` é trocada por uma negação escrita só de leitura (`user_recovery_codes_ninguem_le`, `using (false)`); as três ações que escrevem na tabela usam o client de serviço. O servidor passa a gravar `code_hash` como HMAC-SHA256 (32 bytes, com o `INTERNAL_SECRET`): as linhas antigas (o Buffer que o supabase-js serializava como texto JSON, que o login nunca achava) são apagadas pelo FORMATO, então re-aplicar não apaga código novo. A tela de Segurança avisa quem ficou sem códigos. Idempotente, psql puro, sem BEGIN/COMMIT; espelho no apêndice do `baseline.sql`.

do $$
begin
  revoke all on table public.user_recovery_codes from anon, authenticated;

  drop policy if exists recovery_codes_self on public.user_recovery_codes;
  -- A restritiva da 0502 perde o sentido sem privilégio nenhum para o login.
  drop policy if exists recovery_codes_mfa_provada on public.user_recovery_codes;
  drop policy if exists user_recovery_codes_ninguem_le on public.user_recovery_codes;
  create policy user_recovery_codes_ninguem_le
    on public.user_recovery_codes
    for select
    using (false);
end
$$;

delete from public.user_recovery_codes
 where octet_length(code_hash) <> 32;
