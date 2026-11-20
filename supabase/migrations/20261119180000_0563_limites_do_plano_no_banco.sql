-- 0563 — Os limites do plano também DENTRO do banco (auditoria de planos de
-- 19/11/2026, achado 5).
--
-- Os limites de cada plano (números de WhatsApp, funis, agentes de IA, chatbots
-- ligados e pessoas da equipe) eram cobrados só nas rotas da API. Mas quem está
-- logado pode escrever algumas tabelas direto pela API pública do banco, com a
-- chave pública e o próprio token de sessão (que fica no navegador dele): um
-- administrador do Essencial ligava o 3º chatbot, criava o 5º funil ou
-- reativava pessoas da equipe sem passar pela conta do plano.
--
-- 1. `fn_limite_do_plano(org, limite)`: o mesmo número que o CRM barra
--    (`lib/billing/catalogo.ts` + `lib/billing.ts`): o plano em vigor (descida
--    vencida já vale), a proposta do Escala só para cima (até 1000), e a descida
--    pendente já limita. Sem assinatura nenhuma = instalação que não vende
--    planos = sem limite (NULL). Assinatura parada = 0.
--    `tests/unit/limites-do-plano-no-banco.test.ts` confere os números contra o
--    catálogo: mudar um sem o outro reprova.
-- 2. `fn_plano_alcanca(org, plano)`: o plano em vigor chega a este? (sem
--    assinatura = sim, parada = não).
-- 3. Gatilho `fn_cota_do_plano_na_escrita` em chatbot_flows, crm_pipelines,
--    ai_agents, user_organizations e channel_sessions: só para a escrita feita
--    como `authenticated` (a API pública e as rotas que usam o cliente do
--    usuário); o servidor com a service role já contou antes. Só barra o que
--    AUMENTA o uso (ligar, criar ativo, desarquivar, reativar), nunca desligar
--    ou arquivar. A contagem é a da tela, e para pessoas da equipe é MAIS
--    frouxa que a da rota (não conta convite pendente): o banco nunca recusa o
--    que a rota já aceitou.
-- 4. `fn_set_channel_routing` e `fn_set_channel_distribution_mode` exigem o
--    Escala para LIGAR o jeito por número (desligar segue livre).
--
-- Idempotente. Funções revogadas de public/anon (doutrina de migrations, regra 9).

create or replace function public.fn_plano_vigente_da_org(p_org uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_plano text;
begin
  select sub.plan_type, sub.plan_id, sub.status, sub.current_period_end,
         sub.troca_tipo, sub.troca_plano, sub.troca_efetiva_em
    into s
    from public.subscriptions sub
   where sub.organization_id = p_org
   order by sub.created_at desc nulls last, sub.id desc
   limit 1;
  if not found then return null; end if;
  if not (s.status in ('active', 'trialing', 'canceled')
          and s.current_period_end is not null and s.current_period_end > now()) then
    return 'inativo';
  end if;
  v_plano := s.plan_type;
  if s.troca_tipo = 'downgrade' and s.troca_efetiva_em is not null
     and s.troca_efetiva_em <= now() and s.troca_plano in ('essencial', 'impulso', 'escala') then
    v_plano := s.troca_plano;
  end if;
  if v_plano is null then
    select p.slug into v_plano from public.plans p where p.id = s.plan_id;
  end if;
  if v_plano is null or v_plano not in ('essencial', 'impulso', 'escala') then
    return 'desconhecido';
  end if;
  return v_plano;
end;
$$;
revoke execute on function public.fn_plano_vigente_da_org(uuid) from public, anon, authenticated;
grant execute on function public.fn_plano_vigente_da_org(uuid) to service_role;

create or replace function public.fn_limite_do_plano(p_org uuid, p_limite text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  -- Os pacotes da página (lib/billing/catalogo.ts, PLANOS_COMERCIAIS).
  pacotes constant jsonb := '{
    "essencial": {"whatsapp": 2, "pipelines": 2, "agentes_ia": 1, "chatbots": 1, "usuarios": 2},
    "impulso":   {"whatsapp": 4, "pipelines": 4, "agentes_ia": 2, "chatbots": 2, "usuarios": 4},
    "escala":    {"whatsapp": 6, "pipelines": 6, "agentes_ia": 3, "chatbots": 3, "usuarios": 6}
  }'::jsonb;
  v_plano text;
  v_limite integer;
  v_proposta jsonb;
  v_valor numeric;
  s record;
begin
  if p_limite not in ('whatsapp', 'pipelines', 'agentes_ia', 'chatbots', 'usuarios') then
    raise exception 'limite_desconhecido' using errcode = '22023';
  end if;
  v_plano := public.fn_plano_vigente_da_org(p_org);
  if v_plano is null then return null; end if;
  if v_plano in ('inativo', 'desconhecido') then return 0; end if;
  v_limite := (pacotes -> v_plano ->> p_limite)::integer;

  select sub.limites_personalizados, sub.troca_tipo, sub.troca_plano, sub.troca_efetiva_em
    into s
    from public.subscriptions sub
   where sub.organization_id = p_org
   order by sub.created_at desc nulls last, sub.id desc
   limit 1;
  -- Proposta do Escala: só para cima do pacote, inteira, até 1000.
  if v_plano = 'escala' and jsonb_typeof(s.limites_personalizados) = 'object' then
    v_proposta := s.limites_personalizados -> p_limite;
    if jsonb_typeof(v_proposta) = 'number' then
      v_valor := (v_proposta #>> '{}')::numeric;
      if v_valor = trunc(v_valor) and v_valor >= v_limite and v_valor <= 1000 then
        v_limite := v_valor::integer;
      end if;
    end if;
  end if;
  -- Descida pendente: criar já respeita o plano menor.
  if s.troca_tipo = 'downgrade' and s.troca_plano in ('essencial', 'impulso', 'escala')
     and s.troca_plano <> v_plano then
    v_limite := least(v_limite, (pacotes -> s.troca_plano ->> p_limite)::integer);
  end if;
  return v_limite;
end;
$$;
revoke execute on function public.fn_limite_do_plano(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_limite_do_plano(uuid, text) to service_role;

create or replace function public.fn_plano_alcanca(p_org uuid, p_minimo text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  ordem constant jsonb := '{"essencial": 0, "impulso": 1, "escala": 2}'::jsonb;
  v_plano text := public.fn_plano_vigente_da_org(p_org);
begin
  if v_plano is null then return true; end if;
  if not (ordem ? v_plano) or not (ordem ? p_minimo) then return false; end if;
  return (ordem ->> v_plano)::integer >= (ordem ->> p_minimo)::integer;
end;
$$;
revoke execute on function public.fn_plano_alcanca(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_plano_alcanca(uuid, text) to service_role;

-- O gatilho é SECURITY DEFINER para contar TODAS as linhas da organização (a
-- RLS de quem escreve não pode esconder linha e afrouxar a conta). Quem
-- escreveu é lido de `request.jwt.claims` (a API pública grava ali o papel) e
-- da configuração `role` (o SET ROLE que a API pública e os testes fazem), que
-- a troca de identidade da função SECURITY DEFINER não altera.
create or replace function public.fn_cota_do_plano_na_escrita()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_papel text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_chave text;
  v_uso integer;
  v_limite integer;
begin
  if v_papel <> 'authenticated' and coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if public.fn_is_platform_admin() then return new; end if;

  if tg_table_name = 'chatbot_flows' then
    if not coalesce(new.is_active, false) or (tg_op = 'UPDATE' and coalesce(old.is_active, false)) then
      return new;
    end if;
    v_chave := 'chatbots';
    select count(*) into v_uso from public.chatbot_flows
     where organization_id = new.organization_id and is_active and id <> new.id;
  elsif tg_table_name = 'crm_pipelines' then
    if coalesce(new.is_archived, false) or (tg_op = 'UPDATE' and not coalesce(old.is_archived, false)) then
      return new;
    end if;
    v_chave := 'pipelines';
    select count(*) into v_uso from public.crm_pipelines
     where organization_id = new.organization_id and not is_archived and id <> new.id;
  elsif tg_table_name = 'ai_agents' then
    if new.archived_at is not null or (tg_op = 'UPDATE' and old.archived_at is null) then
      return new;
    end if;
    v_chave := 'agentes_ia';
    select count(*) into v_uso from public.ai_agents
     where organization_id = new.organization_id and archived_at is null and id <> new.id;
  elsif tg_table_name = 'user_organizations' then
    if new.revoked_at is not null or new.role = 'ai_operator'
       or (tg_op = 'UPDATE' and old.revoked_at is null and old.role <> 'ai_operator') then
      return new;
    end if;
    v_chave := 'usuarios';
    select count(*) into v_uso from public.user_organizations
     where organization_id = new.organization_id and revoked_at is null
       and role <> 'ai_operator' and id <> new.id;
  elsif tg_table_name = 'channel_sessions' then
    if new.archived_at is not null or new.provider not in ('waha', 'meta_cloud', 'zernio', 'datafy')
       or (tg_op = 'UPDATE' and old.archived_at is null
           and old.provider in ('waha', 'meta_cloud', 'zernio', 'datafy')) then
      return new;
    end if;
    v_chave := 'whatsapp';
    select count(*) into v_uso from public.channel_sessions
     where organization_id = new.organization_id and archived_at is null
       and provider in ('waha', 'meta_cloud', 'zernio', 'datafy') and id <> new.id;
  else
    return new;
  end if;

  v_limite := public.fn_limite_do_plano(new.organization_id, v_chave);
  if v_limite is not null and v_uso + 1 > v_limite then
    raise exception 'plano_limite_atingido:%', v_chave
      using errcode = '42501',
            hint = 'O plano da organização não permite mais. Mude de plano em Configurações › Plano e cobrança.';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_cota_do_plano_na_escrita() from public, anon, authenticated;

drop trigger if exists trg_cota_do_plano on public.chatbot_flows;
create trigger trg_cota_do_plano before insert or update of is_active on public.chatbot_flows
  for each row execute function public.fn_cota_do_plano_na_escrita();
drop trigger if exists trg_cota_do_plano on public.crm_pipelines;
create trigger trg_cota_do_plano before insert or update of is_archived on public.crm_pipelines
  for each row execute function public.fn_cota_do_plano_na_escrita();
drop trigger if exists trg_cota_do_plano on public.ai_agents;
create trigger trg_cota_do_plano before insert or update of archived_at on public.ai_agents
  for each row execute function public.fn_cota_do_plano_na_escrita();
drop trigger if exists trg_cota_do_plano on public.user_organizations;
create trigger trg_cota_do_plano before insert or update of revoked_at, role on public.user_organizations
  for each row execute function public.fn_cota_do_plano_na_escrita();
drop trigger if exists trg_cota_do_plano on public.channel_sessions;
create trigger trg_cota_do_plano before insert or update of archived_at, provider on public.channel_sessions
  for each row execute function public.fn_cota_do_plano_na_escrita();

create or replace function public.fn_set_channel_routing(p_org uuid,p_channel uuid,p_users uuid[],p_reset boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_policy_id uuid; requested_count integer; found_count integer;
begin
 if auth.uid() is null or not public.fn_role_at_least(p_org,'manager') or not public.fn_support_write_allowed(p_org)
 then raise exception 'routing_forbidden' using errcode='42501';end if;
 if not public.fn_session_mfa_proven() then raise exception 'routing_mfa_required' using errcode='42501';end if;
 -- Responsáveis por número é "Distribuição por número e por time" (Escala). Voltar
 -- ao padrão (p_reset) vale em qualquer plano: quem desceu precisa conseguir sair.
 if not p_reset and not public.fn_plano_alcanca(p_org, 'escala') then
  raise exception 'routing_plan_required' using errcode='42501';end if;
 if p_users is null or cardinality(p_users)>1000 or array_position(p_users,null) is not null then
  raise exception 'routing_invalid_members' using errcode='22023';end if;
 -- Leitores de claim usam SHARE nesta identidade, inclusive na ausência de policy.
 perform 1 from public.channel_sessions where organization_id=p_org and id=p_channel and archived_at is null for update;
 if not found then raise exception 'routing_channel_not_found' using errcode='P0002';end if;
 if p_reset then
  delete from public.channel_routing_policies where organization_id=p_org and channel_session_id=p_channel;
 else
  select count(distinct x) into requested_count from unnest(p_users) x;
  perform 1 from public.user_organizations where organization_id=p_org and user_id=any(p_users)
   and revoked_at is null and role in('agent','manager','admin') order by user_id for share;
  get diagnostics found_count=row_count;
  if found_count<>requested_count then raise exception 'routing_invalid_members' using errcode='22023';end if;
  insert into public.channel_routing_policies(organization_id,channel_session_id) values(p_org,p_channel)
   on conflict(organization_id,channel_session_id) do update set updated_at=now() returning id into v_policy_id;
  delete from public.channel_routing_responsibles where organization_id=p_org and channel_routing_responsibles.policy_id=v_policy_id;
  insert into public.channel_routing_responsibles(organization_id,policy_id,user_id)
   select p_org,v_policy_id,x from(select distinct unnest(p_users) x) users;
 end if;
 perform public.fn_wake_channel_routing(p_org,p_channel);
 return jsonb_build_object('channel_session_id',p_channel,'policy_id',v_policy_id,
  'mode',case when p_reset then 'legacy_unconfigured' when cardinality(p_users)=0 then 'restricted_empty' else 'restricted' end,
  'user_ids',case when p_reset then '[]'::jsonb else to_jsonb(p_users) end);
end;
$$;

create or replace function public.fn_set_channel_distribution_mode(p_org uuid, p_channel uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.fn_role_at_least(p_org, 'manager') or not public.fn_support_write_allowed(p_org)
  then raise exception 'routing_forbidden' using errcode = '42501'; end if;
  if not public.fn_session_mfa_proven() then raise exception 'routing_mfa_required' using errcode = '42501'; end if;
  -- O jeito POR NÚMERO é "Distribuição por número e por time" (Escala). Voltar a
  -- seguir a organização (p_mode nulo) vale em qualquer plano.
  if p_mode is not null and not public.fn_plano_alcanca(p_org, 'escala') then
    raise exception 'routing_plan_required' using errcode = '42501';
  end if;
  if p_mode is not null and p_mode not in ('manual', 'round_robin', 'least_load') then
    raise exception 'routing_invalid_mode' using errcode = '22023';
  end if;
  update public.channel_sessions set routing_mode = p_mode
   where organization_id = p_org and id = p_channel and archived_at is null;
  if not found then raise exception 'routing_channel_not_found' using errcode = 'P0002'; end if;
  perform public.fn_wake_channel_routing(p_org, p_channel);
  return jsonb_build_object('channel_session_id', p_channel, 'routing_mode', p_mode);
end;
$$;
