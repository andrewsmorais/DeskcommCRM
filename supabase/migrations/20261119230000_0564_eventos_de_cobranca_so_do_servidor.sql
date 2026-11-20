-- 0564 — eventos que mandam e-mail de cobrança são do servidor.
--
-- Auditoria de planos de 19/11/2026, achado 17b. `emit_event` é RPC aberta a
-- quem está logado (qualquer membro, até leitor), e o e-mail de "reembolso
-- confirmado" lia o VALOR do payload do evento. Um leitor chamava
-- emit_event('reembolso.confirmado', ..., '{"value": 99999}') e, com a
-- assinatura suspensa, recebia da plataforma um e-mail de "reembolso de
-- R$ 99.999,00 confirmado" — uma prova forjada com a marca da empresa.
--
-- Todo emissor legítimo dos cinco eventos que mandam e-mail é a service role:
--   conta.criada          lib/auth/provision.ts (cliente admin)
--   plano.alterado        gatilho fn_emitir_plano_alterado em subscriptions,
--                         que só a service role escreve
--   plano.troca_pedida    app/api/v1/billing/trocar-plano (cliente admin)
--   reembolso.confirmado  webhook do Asaas na página de vendas (service role)
--   assinatura.cancelada  app/api/v1/billing/cancel (cliente admin)
-- então vindo de login (auth.uid() presente) a função recusa com 42501, como
-- já fazia com os eventos de comando (0499). O corpo é o da 0554 (a versão em
-- vigor) com a recusa nova logo depois da dos eventos de comando.
--
-- Idempotente: CREATE OR REPLACE mantém os GRANTs; a revogação abaixo é
-- repetida por segurança (as duas origens de EXECUTE, doutrina 9).

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
  v_situacao text;
  v_revisao_desde timestamptz;
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
  -- Eventos que mandam E-MAIL DE COBRANÇA ao cliente também são do servidor
  -- (0564). Quem os produz de verdade é sempre a service role: o cadastro
  -- (`conta.criada`), o gatilho de `subscriptions` (`plano.alterado`), a rota
  -- da troca (`plano.troca_pedida`), o webhook do Asaas na página de vendas
  -- (`reembolso.confirmado`) e o cancelamento (`assinatura.cancelada`). Vindo
  -- de login, um leitor emitia `reembolso.confirmado` com o valor que quisesse
  -- e recebia da plataforma um e-mail de "reembolso de R$ X confirmado" — uma
  -- prova forjada (auditoria de planos de 19/11, achado 17b).
  if auth.uid() is not null and p_event_type in (
    'conta.criada','plano.alterado','plano.troca_pedida',
    'reembolso.confirmado','assinatura.cancelada'
  ) then
    raise exception 'reserved_billing_event' using errcode='42501';
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

  -- OS EVENTOS DE AGENDAMENTO SÃO AVISO DE UMA MUDANÇA QUE ACONTECEU (0554).
  -- O consumidor da 0551 transforma cada linha `appointment.created`,
  -- `.rescheduled` e `.cancelled` numa mensagem do WhatsApp da empresa para o
  -- dono, e o motor de regras trata as mesmas linhas como gatilho. Antes daqui
  -- qualquer membro logado — até um leitor, que não pode mexer em agendamento —
  -- emitia essas linhas à vontade: mandava ao dono um "cancelado" falso de um
  -- horário de pé, sumia com o aviso verdadeiro represado e gastava o teto
  -- diário do número. Para quem chama logado, a linha só nasce quando:
  --   * a pessoa pode mexer em agendamento (atendente para cima);
  --   * aponta um agendamento DESTA organização, o mesmo no payload e na
  --     entidade, com o autor que a rota grava para pessoa (`user`);
  --   * a situação GRAVADA confere com o evento (cancelado só se cancelado;
  --     marcado/remarcado só se pendente ou confirmado);
  --   * é a primeira desse tipo desde a última mudança do agendamento — uma
  --     notícia por mudança, não uma por chamada.
  -- O servidor (service role: IA, MCP, Google) segue como antes.
  if auth.uid() is not null and p_event_type in (
    'appointment.created','appointment.rescheduled','appointment.cancelled'
  ) then
    if not public.fn_role_at_least(v_org_id, 'agent') then
      raise exception 'appointment_event_forbidden' using errcode='42501';
    end if;
    if p_entity_kind is distinct from 'calendar_appointment'
       or p_entity_id is null
       or (coalesce(p_payload,'{}'::jsonb) ? 'appointment_id'
           and (p_payload->>'appointment_id') is distinct from p_entity_id::text)
       or coalesce(p_payload->>'autor', 'user') <> 'user' then
      raise exception 'appointment_event_mismatch' using errcode='42501';
    end if;
    select a.status, a.revision_started_at into v_situacao, v_revisao_desde
      from public.calendar_appointments a
     where a.organization_id = v_org_id and a.id = p_entity_id;
    if not found
       or (p_event_type = 'appointment.cancelled' and v_situacao <> 'cancelled')
       or (p_event_type <> 'appointment.cancelled' and v_situacao not in ('pending','confirmed')) then
      raise exception 'appointment_event_mismatch' using errcode='42501';
    end if;
    if exists (
      select 1 from public.event_log e
       where e.entity_kind = 'calendar_appointment'
         and e.entity_id = p_entity_id
         and e.organization_id = v_org_id
         and e.event_type = p_event_type
         and e.created_at >= v_revisao_desde
    ) then
      raise exception 'appointment_event_replayed' using errcode='42501';
    end if;
  end if;

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

revoke execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) from public, anon;
grant  execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) to authenticated, service_role;
