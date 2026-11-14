-- 0517 — telefone oculto por atendente (14/11/2026).
--
-- Paridade com a Umbler Talk ("Ocultar número de telefone"): o gerente marca,
-- por pessoa da equipe, quem NÃO vê o telefone dos contatos. Para ela, o
-- servidor devolve todo número mascarado (lib/contatos/telefone-oculto.ts).
--
-- `fn_eu_oculto_telefone(p_org)` responde, para quem chama (auth.uid()), se o
-- telefone deve sair mascarado na organização (ou, sem organização, em alguma
-- delas — o lado seguro). `security definer` só para ler a própria linha de
-- membro sem depender da RLS; não aceita usuário como parâmetro. Idempotente.

-- ---- telefone oculto por atendente (migration 0517) ----
alter table public.user_organizations
  add column if not exists ocultar_telefone boolean not null default false;
comment on column public.user_organizations.ocultar_telefone is
  'Esta pessoa não vê o telefone dos contatos desta organização: o servidor o devolve mascarado (paridade com a Umbler). Marcado pelo gerente em Equipe. Migration 0517.';

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
     and (p_org is null or uo.organization_id = p_org);
$f$;
revoke execute on function public.fn_eu_oculto_telefone(uuid) from public, anon;
grant execute on function public.fn_eu_oculto_telefone(uuid) to authenticated, service_role;

-- O número mascarado ("+55•••••••••88") nunca é gravado no lugar do
-- verdadeiro: a trava `contacts_phone_e164_format` (só dígitos depois do +) já
-- recusa — por isso esta migration não cria outra.
