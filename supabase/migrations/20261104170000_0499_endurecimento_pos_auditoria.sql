-- 0499 — endurecimento do banco depois da auditoria de segurança (04/11/2026).
--
-- Cada bloco fecha uma porta que a auditoria reproduziu num banco fresco com o
-- baseline: o PostgREST (anon key + JWT do próprio membro) alcançava escritas
-- que as rotas do app reservam a papéis maiores ou ao servidor. Idempotente:
-- o update.sh reaplica o baseline inteiro, e cada bloco tem de poder rodar de
-- novo sem efeito colateral.

-- ── 1. api_audit_log: o PostgREST não insere ────────────────────────────────
-- A trilha é append-only para os papéis do PostgREST (0258 tirou UPDATE,
-- DELETE e TRUNCATE), mas o INSERT seguia concedido, com uma policy que só
-- pedia "é da sua org (ou nula)": qualquer membro, até leitor, gravava linha
-- atribuída a QUALQUER ator, com qualquer ação e data — e essas linhas iam
-- para a tela de auditoria, o CSV, o PDF de LGPD do titular e a numeração de
-- propostas. Nenhum escritor legítimo usa o login: `lib/audit` grava com a
-- service role, que é obrigatória (`lib/env.ts`).
drop policy if exists audit_log_insert_tenant_member on public.api_audit_log;
revoke insert on table public.api_audit_log from public, anon, authenticated;

-- ── 2. memória da organização: membro lê, só o servidor escreve ─────────────
-- As três tabelas tinham a policy genérica FOR ALL "é membro" e INSERT/UPDATE/
-- DELETE concedidos: um leitor ou atendente gravava regra "da empresa" que
-- entra no prompt de TODO atendimento, passando por cima das rotas (gerente
-- para entradas, admin para o documento). Todo escritor legítimo (rotas,
-- ferramenta MCP, flywheel) usa a service role; a tela lê pelo login.
do $$
declare t text;
begin
  foreach t in array array['org_memory_entries','org_memory_pointers','org_memory_versions'] loop
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format('drop policy if exists %s_leitura on public.%I', t, t);
    execute format(
      'create policy %s_leitura on public.%I for select to authenticated '
      'using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 3. emit_event: eventos de comando são do servidor ───────────────────────
-- Corpo DERIVADO da última definição vigente; a única mudança é a reserva
-- dos tipos de comando para chamador logado.
CREATE OR REPLACE FUNCTION public.emit_event(p_event_type text, p_entity_kind text, p_entity_id uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_event_id uuid;
  v_contact uuid;
  v_origin jsonb;
begin
  -- message.received nasce somente do INSERT inbound interno. Um chamador
  -- público não pode reapresentar uma mensagem existente como evento novo.
  -- `ai.case_opened`/`ai.case_closed` entram pela mesma razão (0279): o caso é
  -- do motor, e um evento de caso forjado por login move o funil e acorda o
  -- agente em nome de uma decisão que ninguém tomou.
  if auth.uid() is not null and p_event_type in (
    'message.received','appointment.outcome_confirmed',
    'ai.case_opened','ai.case_closed'
  ) then
    raise exception 'reserved_message_received' using errcode='42501';
  end if;
  -- Eventos de COMANDO são do servidor (0499). Os drenos tratam toda linha
  -- pendente destes tipos como ordem autorizada — despachar o agente, iniciar
  -- ou retomar chatbot, buscar mídia, notificar menção — e quem os produz de
  -- verdade é sempre a service role. Vindos de login (até um leitor), eram
  -- uma porta para acordar o agente, puxar mídia de URL escolhida e travar o
  -- dreno compartilhado.
  if auth.uid() is not null and (
    p_event_type like '%\_requested' escape '\'
    or p_event_type = 'user.mentioned'
  ) then
    raise exception 'reserved_command_event' using errcode='42501';
  end if;
  -- Estes campos autorizam efeitos operacionais; não são payload público.
  if auth.uid() is not null and (
    coalesce(p_payload,'{}'::jsonb) ?| array['service_origin','service_boundary']
    or coalesce(p_metadata,'{}'::jsonb) ?| array['service_origin','service_boundary']
  ) then raise exception 'reserved_service_origin' using errcode='42501'; end if;
  v_org_id := coalesce(p_organization_id, (public.fn_support_context()->>'organization_id')::uuid);
  if v_org_id is null then
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;

  if auth.uid() is not null
     and not public.fn_role_at_least(v_org_id, 'viewer') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'emit_event: caller must be an active member of the organization';
  end if;

  if not public.fn_support_write_allowed(v_org_id) then raise exception 'support_readonly' using errcode='42501'; end if;

  -- A ORIGEM E RESERVADA AO SERVIDOR — ENTAO O SERVIDOR TEM DE ESCREVE-LA.
  --
  -- O bloco acima recusa `service_origin` vindo de chamador autenticado (42501,
  -- e com razao: e o campo que AUTORIZA efeito operacional, nao payload
  -- publico). So que ninguem o escrevia no lugar dele. Efeito medido: quem move
  -- o negocio pela IA carimba a origem no servidor (`agent-stage-sync`,
  -- `appointment-stage-move`, `handoff-stage-move`) e o follow-up nasce; quem
  -- move PELO QUADRO — o operador, pela rota HTTP autenticada — emitia um
  -- evento SEM origem, `fn_service_event_origin` caia no `service_stale` final
  -- (40001), `serviceForEvent` engolia como `stale_origin` e o follow-up nunca
  -- nascia. Sem erro em lugar nenhum: o gatilho de etapa era inalcancavel pelo
  -- caminho que o produto oferece na tela.
  --
  -- O retrato e tirado AQUI, no instante da emissao, que e exatamente a
  -- semantica de procedencia que a 0223 quer: "quando este evento nasceu, o
  -- atendimento estava assim". A resolucao do contato repete a mesma regra de
  -- `fn_service_event_origin` — se ela nao souber resolver o tipo, nao ha o que
  -- carimbar e o evento segue sem origem, como antes.
  if not (coalesce(p_payload,'{}'::jsonb) ? 'service_origin')
     and not (coalesce(p_metadata,'{}'::jsonb) ? 'service_origin') then
    if p_event_type in ('lead.created','lead.stage_changed','lead.tag_added') and p_entity_kind='crm_lead' then
      select contact_id into v_contact from public.crm_leads where organization_id=v_org_id and id=p_entity_id;
    elsif p_event_type='contact.tag_added' and p_entity_kind='contact' then
      select id into v_contact from public.contacts where organization_id=v_org_id and id=p_entity_id;
    end if;
    if v_contact is not null
       and exists(select 1 from public.contacts
                   where organization_id=v_org_id and id=v_contact
                     and not is_anonymized and is_merged_into is null) then
      v_origin := jsonb_build_object('kind','command',
        'observed', public.fn_service_observe_command(v_org_id, v_contact));
    end if;
  end if;

  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb)
       || case when v_origin is null then '{}'::jsonb else jsonb_build_object('service_origin', v_origin) end,
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;

  return v_event_id;
end $function$;

-- ── 4. fn_conversation_assign respeita a visibilidade da conversa ───────────
-- Corpo DERIVADO da última definição vigente; a única mudança é o ramo de
-- visibilidade para chamador logado.
CREATE OR REPLACE FUNCTION public.fn_conversation_assign(p_organization_id uuid, p_conversation_id uuid, p_to_user_id uuid, p_reason text, p_expected_assignee uuid DEFAULT NULL::uuid, p_enforce_expected boolean DEFAULT false)
 RETURNS SETOF conversations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from uuid;
  v_private boolean;
  v_conv public.conversations%rowtype;
begin
  if not public.fn_support_write_allowed(p_organization_id) then raise exception 'support_readonly' using errcode='42501'; end if;
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;

  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;

  select assigned_to_user_id, is_private into v_from, v_private
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
   for no key update;

  if not found then
    return;
  end if;

  -- QUEM NÃO VÊ A CONVERSA NÃO A TOMA PARA SI (0499). A atribuição desbloqueia
  -- a leitura (o novo dono passa a ver tudo), então autorizar só pelo papel
  -- deixava um atendente "assumir" uma conversa privada ou fora do seu escopo
  -- e lê-la em seguida. Para o chamador logado vale a MESMA régua do SELECT
  -- (`fn_can_view_conversation`); o roteamento do servidor (sem auth.uid())
  -- segue igual. Sem linha devolvida, as rotas respondem como "não encontrada".
  if auth.uid() is not null
     and not public.fn_can_view_conversation(p_organization_id, v_from, coalesce(v_private, false)) then
    return;
  end if;

  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;

  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         -- Desnormalizado JUNTO com o dono, na mesma transação: nunca existe
         -- uma janela em que id e nome discordam. NULL junto com o id quando
         -- a atribuição é removida (release) — nunca sobra um nome órfão de
         -- dono nenhum. Lido de auth.users porque quem chama esta função
         -- (RPC) não necessariamente tem acesso ao Admin API — a definer
         -- resolve por dentro.
         assigned_to_user_name = case
           when p_to_user_id is null then null
           else (select raw_user_meta_data ->> 'full_name' from auth.users where id = p_to_user_id)
         end,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         bot_silenced_until = case
           when p_reason = 'routing'  then bot_silenced_until
           when p_to_user_id is null  then (case when last_handoff_at is null
                                                 then null
                                                 else bot_silenced_until end)
           else 'infinity'::timestamptz
         end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;

  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);

  return next v_conv;
end;
$function$;

-- ── 5. item de comanda é da mesma organização da comanda ────────────────────
-- A rota buscava a comanda por qualquer org do usuário e gravava o item com a
-- org ativa: quem era atendente em A e leitor em B pendurava item de A numa
-- comanda de B, que a finalização de B somava como receita e comissão. A rota
-- foi corrigida; o banco passa a recusar o par incoerente por qualquer porta.
-- Linhas antigas não são tocadas (a trava vale para INSERT e para quem mexe
-- em sale_id/organization_id). SECURITY INVOKER de propósito: quem insere pelo
-- login enxerga as comandas das próprias orgs, e é só isso que a comparação
-- precisa; uma comanda que ele nem vê também é recusada.
create or replace function public.fn_sale_item_mesma_org()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.sales s
     where s.id = new.sale_id and s.organization_id = new.organization_id
  ) then
    raise exception 'sale_item_org_mismatch'
      using errcode = '23514',
            hint = 'O item tem de ser da mesma organização da comanda.';
  end if;
  return new;
end $$;
revoke execute on function public.fn_sale_item_mesma_org() from public, anon;
grant execute on function public.fn_sale_item_mesma_org() to authenticated, service_role;
drop trigger if exists trg_sale_item_mesma_org on public.sale_items;
create trigger trg_sale_item_mesma_org
  before insert or update of sale_id, organization_id on public.sale_items
  for each row execute function public.fn_sale_item_mesma_org();

-- ── 6. webhook_events_log: leitura a partir de gerente, sem o hottok ────────
-- O log guardava o cabeçalho X-HOTMART-HOTTOK (o segredo da fonte) e qualquer
-- membro, até leitor, lia a linha inteira. A rota que mostra os eventos já
-- exige gerente; a policy passa a exigir o mesmo, e o hottok já gravado sai.
drop policy if exists webhook_events_log_tenant_read on public.webhook_events_log;
create policy webhook_events_log_tenant_read on public.webhook_events_log
  for select using (
    public.fn_is_platform_admin()
    or (organization_id is not null
        and organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
update public.webhook_events_log
   set headers = headers - 'x-hotmart-hottok'
 where headers ? 'x-hotmart-hottok';

-- ── 7. ai_purpose_bindings: admin do tenant não usa a chave da instalação ───
-- Provedor e modelo que rodam na chave da INSTALAÇÃO são da plataforma. A
-- policy aceitava qualquer escrita de admin do tenant, inclusive vínculo sem
-- credencial (= chave da instalação) com modelo escolhido por ele.
drop policy if exists tenant_isolation_ai_purpose_bindings_write on public.ai_purpose_bindings;
create policy tenant_isolation_ai_purpose_bindings_write on public.ai_purpose_bindings
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
      and (credential_id is not null or public.fn_is_platform_admin())
  );

-- ── 8. api_tokens: credencial permanente só por admin do tenant, fora de acompanhamento ─
-- A policy FOR ALL aceitava "admin do tenant OU qualquer admin da plataforma":
-- um admin da plataforma (ou uma sessão de suporte, que projeta admin)
-- emitia `dsk_` sem prazo numa org alheia, e o token sobrevivia ao fim da
-- sessão e à revogação. Ler e revogar seguem abertos a quem já podia.
drop policy if exists api_tokens_admin_only on public.api_tokens;
drop policy if exists api_tokens_leitura on public.api_tokens;
create policy api_tokens_leitura on public.api_tokens
  for select using (public.fn_role_at_least(organization_id, 'admin') or public.fn_is_platform_admin());
drop policy if exists api_tokens_emissao on public.api_tokens;
create policy api_tokens_emissao on public.api_tokens
  for insert with check (
    public.fn_role_at_least(organization_id, 'admin') and public.fn_support_context() is null
  );
drop policy if exists api_tokens_revogacao on public.api_tokens;
create policy api_tokens_revogacao on public.api_tokens
  for update using (public.fn_role_at_least(organization_id, 'admin') or public.fn_is_platform_admin())
  with check (public.fn_role_at_least(organization_id, 'admin') or public.fn_is_platform_admin());
drop policy if exists api_tokens_remocao on public.api_tokens;
create policy api_tokens_remocao on public.api_tokens
  for delete using (public.fn_role_at_least(organization_id, 'admin') or public.fn_is_platform_admin());

-- ── 9. tenant_integrations: só o servidor ───────────────────────────────────
-- A linha guarda tokens da loja e o segredo do app da Nuvemshop (cifrados com
-- a chave única da instalação) e o vínculo store_id → organização que os
-- webhooks usam. Qualquer membro lia os cifrados; gerente reescrevia o vínculo
-- e quebrava os webhooks de outra organização. Todo código do app usa a
-- service role nesta tabela.
revoke all on table public.tenant_integrations from anon, authenticated;

-- ── 10. messages: ponteiro de mídia só pelo servidor ────────────────────────
-- Um membro reescrevia `media_url` pela REST e o worker de mídia buscava a URL
-- escolhida com a credencial do canal (e seguia redirecionamento para a rede
-- interna). Quem grava estes campos é a ingestão e o envio, pela service role.
create or replace function public.fn_messages_midia_so_pelo_servidor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.media_url is distinct from old.media_url
          or new.media_storage_path is distinct from old.media_storage_path) then
    raise exception 'media_pointer_server_only' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.fn_messages_midia_so_pelo_servidor() from public, anon;
grant execute on function public.fn_messages_midia_so_pelo_servidor() to authenticated, service_role;
drop trigger if exists trg_messages_midia_so_pelo_servidor on public.messages;
create trigger trg_messages_midia_so_pelo_servidor
  before update of media_url, media_storage_path on public.messages
  for each row execute function public.fn_messages_midia_so_pelo_servidor();

-- ── travas do suporte depois de toda mudança de privilégio ──────────────────
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

notify pgrst, 'reload schema';
