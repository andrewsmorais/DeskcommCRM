-- ---- conversa privada (migration 0495) ----
-- "Privar ou liberar" da Umbler: uma conversa PRIVADA só é vista pelo
-- atendente responsável, por gerente/admin e pelo super-admin. Livre (o padrão)
-- segue a regra da organização (`settings.visibility_mode`), como sempre.
--
-- A regra mora numa sobrecarga de 3 argumentos de `fn_can_view_conversation`
-- que COMPÕE a de 2 (nunca a copia): a de 2 continua sendo a régua da
-- organização, e a de 3 só acrescenta a privacidade.
--
-- Quem precisa da de 3:
--   * a policy `conversations_select` — e por ela `messages`, notas, rascunhos,
--     passagens, histórico de atribuição etc., cujas policies consultam
--     `conversations` por dentro e herdam o filtro da RLS dela;
--   * as funções `security definer` que IGNORAM a RLS e chamam a regra direto
--     (`fn_appointment_stamp`, `fn_meet_action`, `fn_reply_action`). O corpo
--     delas é DERIVADO da versão em vigor (pg_get_functiondef + troca exata da
--     chamada), nunca recopiado: recopiar apagaria o que versões posteriores
--     acrescentaram. Quem vigia que nenhuma função definer volte à forma de 2
--     argumentos é tests/invariants/conversa-privada.test.ts.
--
-- Idempotente: coluna `if not exists`, `create or replace`, policy recriada, e a
-- troca no corpo das funções não acha nada na segunda aplicação.
alter table public.conversations add column if not exists is_private boolean not null default false;

comment on column public.conversations.is_private is
  'Conversa privada: só o atendente responsável, gerente/admin e o super-admin a veem (fn_can_view_conversation de 3 argumentos). false = segue settings.visibility_mode. Gravada pela rota PATCH /api/v1/conversations/[id]/privacy e pelo passo "Privar ou liberar" do chatbot.';

create or replace function public.fn_can_view_conversation(
  p_org uuid,
  p_assigned_to_user_id uuid,
  p_is_private boolean
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.fn_can_view_conversation(p_org, p_assigned_to_user_id)
    and (
      not coalesce(p_is_private, false)
      or public.fn_is_platform_admin()
      or p_assigned_to_user_id = auth.uid()
      or public.fn_user_role_in_org(p_org) in ('manager', 'admin')
    );
$$;

revoke all on function public.fn_can_view_conversation(uuid, uuid, boolean) from public;
revoke execute on function public.fn_can_view_conversation(uuid, uuid, boolean) from anon;
grant execute on function public.fn_can_view_conversation(uuid, uuid, boolean)
  to authenticated, service_role;

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    public.fn_can_view_conversation(organization_id, assigned_to_user_id, is_private)
  );

do $conversa_privada$
declare
  r record;
  def text;
  novo text;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.proname in ('fn_appointment_stamp', 'fn_meet_action', 'fn_reply_action')
  loop
    def := pg_get_functiondef(r.oid);
    novo := replace(
      def,
      'public.fn_can_view_conversation(organization_id,assigned_to_user_id)',
      'public.fn_can_view_conversation(organization_id,assigned_to_user_id,is_private)'
    );
    novo := replace(
      novo,
      'public.fn_can_view_conversation(c.organization_id,c.assigned_to_user_id)',
      'public.fn_can_view_conversation(c.organization_id,c.assigned_to_user_id,c.is_private)'
    );
    if novo <> def then
      execute novo;
    end if;
  end loop;
end
$conversa_privada$;
