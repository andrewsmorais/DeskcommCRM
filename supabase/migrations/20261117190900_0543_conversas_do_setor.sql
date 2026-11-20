-- manifest: **O atendente vê as conversas do próprio setor.** Valor novo para `organizations.settings.visibility_mode`: `own_and_sector` — o atendente (`agent`) vê a própria carteira e as conversas cujo `setor_id` é de um setor em que ele está (`setor_membros`), inclusive as que estão com um colega; não vê as dos outros setores nem as privadas de outros. Gerente/admin/leitor seguem vendo tudo. Função nova `fn_escopo_de_setor_da_conversa()` (`stable security definer`, só `authenticated`/`service_role`) e UMA disjunção a mais em `conversations_select`; o resto da regra (`fn_can_view_conversation` com privada) fica igual. Adaptado do produto original (9214 de lá) ao modelo de setores daqui (0496). Idempotente.
--
-- Fatia 1 do O7 (docs/chataionline/o7-setores-fila.md). Mensagens herdam: a
-- policy delas pergunta por `exists` na conversa.

create or replace function public.fn_escopo_de_setor_da_conversa()
returns table (organization_id uuid, setor_id uuid)
language plpgsql stable security definer
set search_path = public
as $$
begin
  -- Os setores do chamador nas organizações em `own_and_sector`. Só o
  -- atendente (`agent`): gerente, admin e leitor já veem a organização inteira
  -- por fn_can_view_conversation. Zero linhas nos outros modos.
  return query
    select m.organization_id, m.setor_id
      from public.setor_membros m
     where m.user_id = auth.uid()
       and public.fn_user_role_in_org(m.organization_id) = 'agent'
       and coalesce((select z.settings->>'visibility_mode'
                       from public.organizations z
                      where z.id = m.organization_id), 'own_and_unassigned') = 'own_and_sector';
end;
$$;

revoke all on function public.fn_escopo_de_setor_da_conversa() from public, anon;
grant execute on function public.fn_escopo_de_setor_da_conversa() to authenticated, service_role;

comment on function public.fn_escopo_de_setor_da_conversa() is
  'Setores do atendente nas organizações em visibility_mode = own_and_sector (migration 0543). Uma linha por (organização, setor). Lida por conversations_select; não concede leitura de nada sozinha.';

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    public.fn_can_view_conversation(organization_id, assigned_to_user_id, is_private)
    -- (0543) O atendente vê a conversa do PRÓPRIO setor, inclusive a que está
    -- com um colega, quando a organização escolheu "os seus e os do seu setor".
    -- Conversa privada continua só de quem já podia vê-la.
    or (
      setor_id is not null
      and not coalesce(is_private, false)
      and (organization_id, setor_id) in (
            select s.organization_id, s.setor_id from public.fn_escopo_de_setor_da_conversa() s
          )
    )
  );

notify pgrst, 'reload schema';
