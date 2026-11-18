-- manifest: **Convidar colega para a conversa (atendimento conjunto).** Tabela `conversation_participants` (uma linha por convidado; `left_at` tira o acesso sem apagar o fato), RLS de leitura só da própria participação, escrita só pelo servidor. `conversations_select` ganha o ramo do participante (mantendo a conversa privada da 0495 e o ramo do setor da 0543); políticas RESTRITIVAS impedem que ler vire mandar: participante não muda nem apaga a conversa nem o histórico de outra pessoa. Gatilho `fn_participacao_atualiza_conversa` toca `updated_at` para a tela atualizar; a tabela entra no tempo real. Adaptado do produto original (0661 e 9016 de lá). Idempotente.
create or replace function public.fn_participacao_atualiza_conversa()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.conversations set updated_at = clock_timestamp()
   where id = new.conversation_id and organization_id = new.organization_id;
  return new;
end;
$$;
revoke execute on function public.fn_participacao_atualiza_conversa() from public, anon, authenticated;
grant execute on function public.fn_participacao_atualiza_conversa() to service_role;

-- Fatia 2 do O7 (docs/chataionline/o7-setores-fila.md). Adaptado do produto
-- original (0661 + 9016 de lá) ao modelo daqui: a policy de leitura continua
-- com a conversa privada (0495) e com o ramo do setor (0543).

create table if not exists public.conversation_participants (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- Quem convidou. `set null` e não `cascade`: perder quem convidou não pode
  -- apagar o fato de a participação existir.
  invited_by       uuid references auth.users(id) on delete set null,
  joined_at        timestamptz not null default now(),
  -- `null` = participação ATIVA. Preenchido = saiu (soft delete). A coluna
  -- existe porque remover tira o ACESSO sem apagar o histórico: "quem já
  -- participou desta conversa" continua respondível.
  left_at          timestamptz,
  -- Um vínculo por (conversa, pessoa). Reentrar é UPDATE (`left_at = null`),
  -- não INSERT novo — é o que sustenta o `on conflict` da rota.
  constraint conversation_participants_unico unique (conversation_id, user_id)
);

-- Auto-cura para o clone que já tenha uma versão anterior da tabela.
alter table public.conversation_participants add column if not exists invited_by uuid;
alter table public.conversation_participants add column if not exists joined_at timestamptz not null default now();
alter table public.conversation_participants add column if not exists left_at timestamptz;

-- Leitor: a lista do convidado — "as conversas em que eu participo". Filtra
-- `left_at is null` porque participação encerrada não é conversa dele.
create index if not exists participantes_por_usuario
  on public.conversation_participants (organization_id, user_id)
  where left_at is null;
-- Leitor: a tela do dono — "quem participa desta conversa".
create index if not exists participantes_por_conversa
  on public.conversation_participants (organization_id, conversation_id);

alter table public.conversation_participants enable row level security;

-- ── Privilégio: leitura pela sessão, escrita SÓ pelo servidor ──────────────
-- `revoke all` PRIMEIRO — o default ACL do baseline concede INSERT/UPDATE/
-- DELETE a `authenticated` a toda tabela nova; sem o revoke, a escrita de um
-- vínculo seria uma chamada PostgREST de qualquer membro.
revoke all    on public.conversation_participants from anon, authenticated;
grant  select on public.conversation_participants to authenticated;
grant  all    on public.conversation_participants to service_role;

-- ── RLS de leitura: organização + papel + É A MINHA LINHA ───────────────────
-- As três condições, e cada uma fecha uma porta:
--   · `fn_user_org_ids`    — o vizinho não lê (invariante cross-org);
--   · `fn_role_at_least`   — `viewer` não lê vínculo de atendimento;
--   · `user_id = auth.uid()` — cada um lê a PRÓPRIA participação, e só ela
--     (ver o cabeçalho: citar `conversations` aqui causaria recursão).
drop policy if exists tenant_isolation_conversation_participants_select on public.conversation_participants;
create policy tenant_isolation_conversation_participants_select
  on public.conversation_participants
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and user_id = auth.uid()
  );

-- ── O ramo que faz o convidado VER a conversa ──────────────────────────────
-- Recria `conversations_select` acrescentando SÓ o `or exists (…)`: a parte
-- `fn_can_view_conversation` fica byte a byte igual (a régua de visibilidade
-- continua sendo ELA; aqui só se ACRESCENTA a porta do participante).
-- O drop e o create vão num ÚNICO bloco DO: o update.sh aplica o baseline sem
-- ON_ERROR_STOP e em autocommit. Soltos, um create que falhasse depois do drop
-- deixaria `conversations` com RLS e SEM policy de SELECT — o inbox sumiria
-- para todos. Dentro do DO, a falha desfaz o drop e a policy anterior fica.

-- A conversa: quem participa (convite ativo) também lê. O convite é decisão
-- explícita de quem já via a conversa, por isso vale também para a privada.
drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    public.fn_can_view_conversation(organization_id, assigned_to_user_id, is_private)
    or (
      setor_id is not null
      and not coalesce(is_private, false)
      and (organization_id, setor_id) in (
            select s.organization_id, s.setor_id from public.fn_escopo_de_setor_da_conversa() s
          )
    )
    or exists (
      select 1
        from public.conversation_participants cp
       where cp.conversation_id = conversations.id
         and cp.organization_id = conversations.organization_id
         and cp.user_id = auth.uid()
         and cp.left_at is null
    )
  );

-- Ler não é mandar: o convite (e o setor) não ampliam UPDATE/DELETE da
-- conversa. Quem já escrevia continua escrevendo; o USING mede a linha ANTES.
drop policy if exists conversation_participant_read_is_not_control_update on public.conversations;
create policy conversation_participant_read_is_not_control_update
  on public.conversations as restrictive for update to authenticated
  using (public.fn_can_view_conversation(organization_id, assigned_to_user_id))
  with check (true);
drop policy if exists conversation_participant_read_is_not_control_delete on public.conversations;
create policy conversation_participant_read_is_not_control_delete
  on public.conversations as restrictive for delete to authenticated
  using (public.fn_can_view_conversation(organization_id, assigned_to_user_id));

-- Responder não dá edição nem exclusão do histórico de outra pessoa: quem é
-- convidado edita/apaga só a própria mensagem enviada.
drop policy if exists message_participant_reply_is_not_history_update on public.messages;
create policy message_participant_reply_is_not_history_update
  on public.messages as restrictive for update to authenticated
  using (
    (sent_by_user_id = auth.uid() and direction = 'outbound' and sent_via in ('user','crm'))
    or exists (select 1 from public.conversations c
      where c.id = messages.conversation_id and c.organization_id = messages.organization_id
        and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id))
  ) with check (
    exists (select 1 from public.conversations c
      where c.id = messages.conversation_id and c.organization_id = messages.organization_id
        and (public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
          or (messages.sent_by_user_id = auth.uid() and messages.direction = 'outbound'
            and messages.sent_via in ('user','crm'))))
  );
drop policy if exists message_participant_reply_is_not_history_delete on public.messages;
create policy message_participant_reply_is_not_history_delete
  on public.messages as restrictive for delete to authenticated
  using (exists (select 1 from public.conversations c
    where c.id = messages.conversation_id and c.organization_id = messages.organization_id
      and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)));

-- O vínculo só é escrito pelo servidor. O toque em `updated_at` acorda quem
-- já observa a conversa pela tela, sem trocar o dono.
drop trigger if exists participacao_atualiza_conversa on public.conversation_participants;
create trigger participacao_atualiza_conversa
  after insert or update on public.conversation_participants
  for each row execute function public.fn_participacao_atualiza_conversa();

-- A própria linha continua legível depois de left_at: a saída também chega
-- pelo tempo real. A publicação pode não existir num Postgres puro.
do $participacoes_realtime$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_participants') then
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end $participacoes_realtime$;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

notify pgrst, 'reload schema';
