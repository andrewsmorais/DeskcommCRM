-- 0519 — telefone oculto: organização desconhecida não desliga a máscara (14/11/2026).
--
-- Achado da auditoria de 14/11/2026 (baixo): `fn_eu_oculto_telefone(p_org)`
-- respondia `false` quando `p_org` era uma organização de que a pessoa NÃO é
-- membro (zero linhas → `coalesce(..., false)`). O servidor mandava em `p_org`
-- o cookie `active_org`, que é do navegador; a autorização, por sua vez, ignora
-- um cookie que não bate com nenhuma organização e serve a primeira da pessoa.
-- Resultado: um atendente marcado como "Oculto" trocava o cookie por qualquer
-- outro UUID e passava a ver os números.
--
-- Agora uma organização de que a pessoa não é membro vale o mesmo que `null`:
-- "estou oculto em ALGUMA das minhas organizações?" — o lado seguro.
--
-- Forward-fix da 0517 (a função é `create or replace`; mesmos grants).
-- Idempotente. No baseline, o corpo novo substitui o do bloco da 0517.

create or replace function public.fn_eu_oculto_telefone(p_org uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $f$
  select coalesce(bool_or(uo.ocultar_telefone), false)
    from public.user_organizations uo
   where uo.user_id = auth.uid()
     and uo.revoked_at is null
     and (
       p_org is null
       or uo.organization_id = p_org
       -- p_org que não é uma organização MINHA não filtra nada.
       or not exists (
         select 1 from public.user_organizations m
          where m.user_id = auth.uid()
            and m.revoked_at is null
            and m.organization_id = p_org
       )
     );
$f$;
revoke execute on function public.fn_eu_oculto_telefone(uuid) from public, anon;
grant execute on function public.fn_eu_oculto_telefone(uuid) to authenticated, service_role;
