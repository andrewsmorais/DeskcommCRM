-- migration 0506 — acompanhamento de suporte não cria nem muda membros
--
-- Num acompanhamento de suporte em modo completo, a pessoa da plataforma tem
-- papel de admin na organização. Ela conseguia convidar a si mesma (ou outro
-- e-mail seu) e aceitar o convite de outra sessão: virava admin PERMANENTE,
-- que sobrevivia ao fim do acompanhamento de 1 h e à revogação do acesso de
-- plataforma (auditoria de 04/11/2026). Decisão de 11/11/2026, como no suporte
-- das ferramentas do mercado: o acesso do suporte é temporário e não cria
-- membro — quem convida é o administrador da empresa.
--
-- As rotas já recusam (`/api/v1/team/invite` e o convite do onboarding); estas
-- restritivas fecham a mesma porta pela REST do Supabase. Só pesam para a
-- sessão que está DENTRO de um acompanhamento (`fn_support_context()` não
-- nulo): o admin da empresa e o servidor seguem iguais. Idempotente.
drop policy if exists sem_suporte_convites_insert on public.team_invites;
create policy sem_suporte_convites_insert on public.team_invites
  as restrictive for insert to authenticated
  with check ((select public.fn_support_context()) is null);
drop policy if exists sem_suporte_convites_update on public.team_invites;
create policy sem_suporte_convites_update on public.team_invites
  as restrictive for update to authenticated
  using ((select public.fn_support_context()) is null)
  with check ((select public.fn_support_context()) is null);

drop policy if exists sem_suporte_membros_insert on public.user_organizations;
create policy sem_suporte_membros_insert on public.user_organizations
  as restrictive for insert to authenticated
  with check ((select public.fn_support_context()) is null);
drop policy if exists sem_suporte_membros_update on public.user_organizations;
create policy sem_suporte_membros_update on public.user_organizations
  as restrictive for update to authenticated
  using ((select public.fn_support_context()) is null)
  with check ((select public.fn_support_context()) is null);
