-- 0509 — endurecimento depois da segunda rodada da auditoria de segurança (11/11/2026).
--
-- A rodada 2 olhou as sete áreas que a primeira deixou de fora (telefonia SIP,
-- telemetria, cópias derivadas das conversas, configuração do motor, prompt do
-- agente e LGPD). Cada bloco fecha uma porta que um agente de auditoria
-- reproduziu num banco fresco com este baseline, pelo papel `authenticated`
-- (anon key + JWT do próprio membro), que é o caminho que o navegador já tem.
-- Mesma régua da 0499 e da 0501: o que o motor trata como configuração ou
-- memória, o membro LÊ e só o servidor (ou o gerente, pela rota) ESCREVE.
-- Idempotente: o update.sh reaplica o baseline inteiro.

-- ── 1. configuração do prompt e dos portões de envio: só o servidor escreve ──
-- Um leitor (viewer) publicava camada de playbook que entra no prompt de TODO
-- atendimento, sobrescrevia skill instalada pelo gerente, mexia na tabela de
-- promessas (preço mínimo, desconto máximo) e no texto de aviso que é colado na
-- primeira mensagem a cada lead novo. Nenhuma rota escreve essas tabelas pelo
-- login: as de skills usam a service role; playbook e tabela de promessas só o
-- servidor semeia. A leitura de catálogo (`catalog_read_*`) fica como está.
do $$
declare t text;
begin
  foreach t in array array[
    'playbook_versions','playbook_pointers','skill_versions','skill_pointers',
    'promise_table_versions','promise_table_pointers',
    'disclosure_template_versions','disclosure_template_pointers'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format('drop policy if exists %s_leitura on public.%I', t, t);
    execute format(
      'create policy %s_leitura on public.%I for select to authenticated '
      'using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 2. follow-up e botões do número: membro lê, gerente escreve ─────────────
-- Um leitor criava fluxo de follow-up com texto fixo, inscrevia qualquer
-- contato e o motor mandava o texto pelo WhatsApp da empresa (o mesmo efeito
-- que a 0501 fechou para cron_jobs/job_queue); também zerava o throttle do
-- número, trocava o fuso por um inválido (todo envio do número parava) ou
-- gravava um padrão de regex que travava o worker de todas as empresas. As
-- rotas que escrevem estas tabelas pelo login já exigem gerente.
do $$
declare t text;
begin
  foreach t in array array[
    'followup_flow_versions','followup_flow_pointers','followup_enrollments',
    'followup_enrollment_events','channel_knobs'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format('drop policy if exists %s_leitura on public.%I', t, t);
    execute format('drop policy if exists %s_escrita on public.%I', t, t);
    execute format(
      'create policy %s_leitura on public.%I for select to authenticated '
      'using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t, t);
    execute format(
      'create policy %s_escrita on public.%I for all to authenticated '
      'using ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''manager'')) or public.fn_is_platform_admin()) '
      'with check ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''manager'')) or public.fn_is_platform_admin())',
      t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── 3. memória do agente sobre o contato: só o servidor escreve ─────────────
-- `lead_checkpoints` (resumo acumulado da conversa, a declaração que vira o
-- briefing do Operador) e `lead_notes` (fatos duráveis do contato) são escritos
-- pelo motor com o pool; a única escrita pelo login (a devolução do
-- atendimento ao agente) passou a usar a service role. Membro não forja
-- memória que o agente lê como verdade.
--   lead_checkpoints: ninguém lê pelo login (nenhuma tela usa; o resumo é da
--   conversa e não seguia a visibilidade dela).
--   lead_notes: o painel do contato lê pelo login; fica a leitura.
do $$
begin
  if to_regclass('public.lead_checkpoints') is not null then
    drop policy if exists tenant_isolation_lead_checkpoints_all on public.lead_checkpoints;
    drop policy if exists lead_checkpoints_leitura on public.lead_checkpoints;
    revoke all on public.lead_checkpoints from anon, authenticated;
    grant all on public.lead_checkpoints to service_role;
  end if;
  if to_regclass('public.lead_notes') is not null then
    drop policy if exists tenant_isolation_lead_notes_all on public.lead_notes;
    drop policy if exists lead_notes_leitura on public.lead_notes;
    create policy lead_notes_leitura on public.lead_notes for select to authenticated
      using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
    revoke insert, update, delete, truncate on public.lead_notes from anon, authenticated;
  end if;
end $$;

-- ── 4. caso e cópia de envio seguem a visibilidade da conversa ─────────────
-- `agent_cases` guarda título, resumo e as cinco últimas mensagens da conversa;
-- um atendente que não via a conversa (de outro atendente, ou privada) lia
-- tudo pela REST. A rota de casos já filtrava; agora a tabela também.
-- `outbound_copies` (texto de cada envio da IA, sem conversa) é só do motor.
drop policy if exists tenant_isolation_agent_cases_select on public.agent_cases;
create policy tenant_isolation_agent_cases_select on public.agent_cases
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1 from public.conversations c
       where c.organization_id = agent_cases.organization_id
         and c.id = agent_cases.conversation_id
         and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)
    )
  );

drop policy if exists tenant_isolation_agent_case_events_select on public.agent_case_events;
create policy tenant_isolation_agent_case_events_select on public.agent_case_events
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1 from public.agent_cases ac
       where ac.organization_id = agent_case_events.organization_id
         and ac.id = agent_case_events.case_id
    )
  );

do $$
begin
  if to_regclass('public.outbound_copies') is not null then
    drop policy if exists outbound_copies_leitura on public.outbound_copies;
    revoke all on public.outbound_copies from anon, authenticated;
    grant all on public.outbound_copies to service_role;
  end if;
end $$;

-- ── 5. LGPD: o que o agente e a equipe escreveram sobre o titular também some ─
-- A anonimização (formal ou pelo botão) não alcançava a memória do agente
-- (lead_notes, lead_state, lead_state_transitions), as notas internas da
-- conversa, as respostas do chatbot nem a prévia de 280 caracteres que o
-- barramento de eventos guarda de cada mensagem. O pedido era dado como
-- concluído com tudo isso legível para a equipe. Mesmo gatilho dos outros:
-- `is_anonymized` virando true, na mesma transação.
create or replace function public.fn_redigir_derivados_ao_anonimizar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.lead_notes
   where organization_id = new.organization_id and contact_id = new.id;
  update public.lead_state
     set next_action = null, qualification = '{}'::jsonb
   where organization_id = new.organization_id and contact_id = new.id;
  update public.lead_state_transitions
     set reason = null
   where organization_id = new.organization_id and contact_id = new.id
     and reason is not null;
  update public.conversation_notes
     set body = '[nota anonimizada]'
   where organization_id = new.organization_id
     and conversation_id in (select c.id from public.conversations c
                              where c.organization_id = new.organization_id and c.contact_id = new.id);
  update public.chatbot_sessions
     set collected_data = '{}'::jsonb
   where organization_id = new.organization_id
     and conversation_id in (select c.id from public.conversations c
                              where c.organization_id = new.organization_id and c.contact_id = new.id);
  update public.event_log
     set payload = payload - 'body_preview'
   where organization_id = new.organization_id
     and payload ? 'body_preview'
     and (payload->>'contact_id' = new.id::text
          or payload->>'conversation_id' in (select c.id::text from public.conversations c
                                              where c.organization_id = new.organization_id and c.contact_id = new.id));
  -- A 0348 zerava a transcrição da ligação na cascata; toda redefinição
  -- posterior da cascata perdeu a linha. Volta aqui, no gatilho.
  update public.voice_calls
     set transcript = null
   where organization_id = new.organization_id and contact_id = new.id
     and transcript is not null;
  return new;
end
$$;
revoke execute on function public.fn_redigir_derivados_ao_anonimizar() from public, anon, authenticated;

drop trigger if exists trg_redigir_derivados_ao_anonimizar on public.contacts;
create trigger trg_redigir_derivados_ao_anonimizar
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized and not coalesce(old.is_anonymized, false))
  execute function public.fn_redigir_derivados_ao_anonimizar();

-- Quem já foi anonimizado antes desta versão: a mesma limpeza, uma vez.
delete from public.lead_notes n
 using public.contacts c
 where c.id = n.contact_id and c.organization_id = n.organization_id and c.is_anonymized;
update public.lead_state s set next_action = null, qualification = '{}'::jsonb
  from public.contacts c
 where c.id = s.contact_id and c.organization_id = s.organization_id and c.is_anonymized
   and (s.next_action is not null or s.qualification <> '{}'::jsonb);
update public.lead_state_transitions t set reason = null
  from public.contacts c
 where c.id = t.contact_id and c.organization_id = t.organization_id and c.is_anonymized
   and t.reason is not null;
update public.conversation_notes n set body = '[nota anonimizada]'
  from public.conversations cv join public.contacts c
    on c.id = cv.contact_id and c.organization_id = cv.organization_id
 where cv.id = n.conversation_id and cv.organization_id = n.organization_id
   and c.is_anonymized and n.body <> '[nota anonimizada]';
update public.chatbot_sessions s set collected_data = '{}'::jsonb
  from public.conversations cv join public.contacts c
    on c.id = cv.contact_id and c.organization_id = cv.organization_id
 where cv.id = s.conversation_id and cv.organization_id = s.organization_id
   and c.is_anonymized and s.collected_data <> '{}'::jsonb;
update public.event_log e set payload = e.payload - 'body_preview'
  from public.contacts c
 where c.is_anonymized and e.organization_id = c.organization_id
   and e.payload ? 'body_preview' and e.payload->>'contact_id' = c.id::text;
update public.voice_calls v set transcript = null
  from public.contacts c
 where c.id = v.contact_id and c.organization_id = v.organization_id
   and c.is_anonymized and v.transcript is not null;

-- ── 6. telefonia ────────────────────────────────────────────────────────────
-- fn_resolve_inbound_number é só do worker de voz: qualquer usuário logado a
-- chamava pela REST e descobria a organização, o agente e o usuário de reserva
-- de qualquer número da instalação.
revoke execute on function public.fn_resolve_inbound_number(text) from public, anon, authenticated;
grant execute on function public.fn_resolve_inbound_number(text) to service_role;

-- Números de telefone: a rota exige gerente; a REST deixava qualquer membro
-- (até leitor) cadastrar o DID de outra empresa e receber as ligações dela.
do $$
begin
  if to_regclass('public.phone_numbers') is not null then
    drop policy if exists phone_numbers_isolation on public.phone_numbers;
    drop policy if exists phone_numbers_leitura on public.phone_numbers;
    drop policy if exists phone_numbers_escrita on public.phone_numbers;
    create policy phone_numbers_leitura on public.phone_numbers for select to authenticated
      using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
    create policy phone_numbers_escrita on public.phone_numbers for all to authenticated
      using ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')) or public.fn_is_platform_admin())
      with check ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')) or public.fn_is_platform_admin());
    revoke all on public.phone_numbers from anon;
  end if;
end $$;

-- Tronco SIP: o endpoint que a ligação usa é sempre o da própria empresa (a
-- rota já deriva o nome; a REST deixava o admin apontar para o tronco de outra
-- empresa no Asterisk compartilhado). Linha legada fora do padrão é corrigida
-- antes da constraint. A senha cifrada deixa de ser lida por qualquer membro.
update public.voip_trunk_settings
   set endpoint_name = 'org-' || organization_id || '-trunk-endpoint'
 where endpoint_name is distinct from 'org-' || organization_id || '-trunk-endpoint';
alter table public.voip_trunk_settings drop constraint if exists voip_trunk_settings_endpoint_da_org;
alter table public.voip_trunk_settings
  add constraint voip_trunk_settings_endpoint_da_org
  check (endpoint_name = 'org-' || organization_id || '-trunk-endpoint');
drop policy if exists voip_trunk_settings_select on public.voip_trunk_settings;
create policy voip_trunk_settings_select on public.voip_trunk_settings for select
  using (public.fn_role_at_least(organization_id, 'manager') or public.fn_is_platform_admin());


-- ── 7. o que a revisão de cobertura da rodada 2 apontou ─────────────────────
-- Transcrição de ligação: a rota de histórico exige gerente; pela REST qualquer
-- membro (até leitor) lia a transcrição de toda ligação da empresa. Atendente
-- para cima lê (é quem atende e vê o histórico de voz); escrever segue como era.
drop policy if exists voice_calls_select on public.voice_calls;
create policy voice_calls_select on public.voice_calls for select
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
  );

-- Respostas ao chatbot (nome, endereço, o que a pessoa digitou): seguem a
-- visibilidade da conversa, como as mensagens. Só o servidor escreve.
do $$
begin
  if to_regclass('public.chatbot_sessions') is not null then
    drop policy if exists tenant_isolation_chatbot_sessions_all on public.chatbot_sessions;
    drop policy if exists chatbot_sessions_leitura on public.chatbot_sessions;
    create policy chatbot_sessions_leitura on public.chatbot_sessions for select to authenticated
      using (
        organization_id in (select public.fn_user_org_ids())
        and exists (
          select 1 from public.conversations c
           where c.organization_id = chatbot_sessions.organization_id
             and c.id = chatbot_sessions.conversation_id
             and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)
        )
      );
    revoke insert, update, delete, truncate on public.chatbot_sessions from anon, authenticated;
  end if;
end $$;

-- Propostas de dado do contato: o atendente confirma ou recusa pela tela;
-- leitor só lê. O estado do funil do agente (a rota de decidir a próxima ação
-- limpa pela service role), o motivo de cada mudança de etapa, a saúde do número (quarentena anti-banimento) e as
-- propostas de melhoria do destilador são escritos só pelo servidor — um
-- leitor soltava a quarentena do número ou forjava uma proposta que o admin
-- aplicaria no prompt achando que veio da IA. Os avisos da Central
-- também: o circuito de saúde lê item aberto como decisão humana.
do $$
declare t text;
begin
  foreach t in array array['contact_field_proposals'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format('drop policy if exists %s_leitura on public.%I', t, t);
    execute format('drop policy if exists %s_escrita on public.%I', t, t);
    execute format(
      'create policy %s_leitura on public.%I for select to authenticated '
      'using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t, t);
    execute format(
      'create policy %s_escrita on public.%I for all to authenticated '
      'using ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''agent'')) or public.fn_is_platform_admin()) '
      'with check ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''agent'')) or public.fn_is_platform_admin())',
      t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  foreach t in array array['lead_state', 'lead_state_transitions', 'channel_session_health',
                           'flywheel_distiller_proposals', 'agent_inbox_items'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %s_escrita on public.%I', t, t);
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format('drop policy if exists %s_leitura on public.%I', t, t);
    execute format(
      'create policy %s_leitura on public.%I for select to authenticated '
      'using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- A identidade da proposta de próxima ação (next_action_seq) acompanha o
-- TEXTO: trocar o texto sem avançar o número faria a aprovação de quem leu a
-- proposta A ser gravada como aprovação da B. Nunca anda para trás.
create or replace function public.fn_lead_state_seq_acompanha_texto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.next_action_seq < old.next_action_seq then
    new.next_action_seq := old.next_action_seq;
  end if;
  if new.next_action is distinct from old.next_action
     and new.next_action_seq <= old.next_action_seq then
    new.next_action_seq := old.next_action_seq + 1;
  end if;
  return new;
end $$;
revoke execute on function public.fn_lead_state_seq_acompanha_texto() from public, anon, authenticated;

-- Próxima ação: identidade presa ao texto (função antes da varredura de anon).
drop trigger if exists trg_lead_state_seq_acompanha_texto on public.lead_state;
create trigger trg_lead_state_seq_acompanha_texto before update on public.lead_state
  for each row execute function public.fn_lead_state_seq_acompanha_texto();

-- Decisão humana sobre a proposta da IA (aprovar/descartar) vira contexto do
-- agente ("o vendedor JÁ APROVOU"), e só vale atada à proposta que a pessoa
-- viu (`next_action_seq`, conferido na rota). Por isso o registro é só da rota
-- (`/api/v1/leads/[id]/next-action`, service role, depois da conferência):
-- pelo login, nem o atendente grava aprovação de um texto que a IA nunca
-- propôs.
drop policy if exists crm_lead_activities_decisao_humana on public.crm_lead_activities;
create policy crm_lead_activities_decisao_humana on public.crm_lead_activities
  as restrictive for insert to authenticated
  with check (type not in ('next_action_approved', 'next_action_dismissed'));

-- Mensagens: quem escreve pelo login é atendente para cima (o leitor não
-- envia nada pela tela), e o login nunca grava linha em nome da IA, da
-- automação ou do sistema — o resgate da fila (session-reconciler) reenvia
-- linha `queued` dessas origens direto ao WhatsApp, sem a cadeia de envio.
drop policy if exists messages_insert_de_atendente on public.messages;
create policy messages_insert_de_atendente on public.messages
  as restrictive for insert to authenticated
  with check (
    public.fn_role_at_least(organization_id, 'agent')
    and sent_via not in ('ai', 'automation', 'system')
  );
drop policy if exists messages_update_de_atendente on public.messages;
create policy messages_update_de_atendente on public.messages
  as restrictive for update to authenticated
  using (public.fn_role_at_least(organization_id, 'agent'))
  with check (public.fn_role_at_least(organization_id, 'agent'));
drop policy if exists messages_delete_de_atendente on public.messages;
create policy messages_delete_de_atendente on public.messages
  as restrictive for delete to authenticated
  using (public.fn_role_at_least(organization_id, 'agent'));

-- Colunas de CONTROLE do contato: bloqueio por opt-out (só o admin reabre, pela
-- rota auditada), anonimização (só pela RPC de LGPD), fusão (só pela RPC de
-- mesclar); `wa_identity`/`wa_lid` são colunas geradas e ninguém as escreve. O
-- login (PostgREST) não as
-- muda; as RPCs `security definer` e a service role passam, porque nelas o
-- `current_user` não é `authenticated`.
create or replace function public.fn_contato_colunas_de_controle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_anonymized, false) or new.is_merged_into is not null then
      raise exception 'colunas_de_controle_do_contato' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.is_blocked is distinct from new.is_blocked
     or old.blocked_reason is distinct from new.blocked_reason
     or old.blocked_at is distinct from new.blocked_at
     or old.is_anonymized is distinct from new.is_anonymized
     or old.anonymized_at is distinct from new.anonymized_at
     or old.is_merged_into is distinct from new.is_merged_into
     or old.merged_at is distinct from new.merged_at then
    raise exception 'colunas_de_controle_do_contato' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.fn_contato_colunas_de_controle() from public, anon, authenticated;

-- ---- colunas de envio da mensagem (migration 0509) ----
-- O resgate da fila (session-reconciler) reenvia direto ao WhatsApp, sem a
-- cadeia de envio, toda linha `queued` de origem IA/automação/sistema. O
-- insert pelo login já não cria linha dessas origens; esta guarda fecha o
-- mesmo caminho pelo UPDATE: o login não troca a origem, a direção, o contato,
-- a conversa nem o número de uma mensagem e não a devolve para `queued`. O
-- texto (e a mídia, e a transcrição) só muda pelo login na mensagem que a
-- própria equipe enviou: o que o cliente escreveu e o que a IA ou a automação
-- mandou é o histórico que o agente lê como fala de cada um. Editar a própria
-- (body + edited_at), apagar (revoked_at), ocultar (metadata) e os desfechos do
-- envio humano (sent/failed) seguem com o atendente; a anonimização (LGPD)
-- roda como dona e passa.
create or replace function public.fn_mensagem_colunas_de_envio()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.sent_via is distinct from new.sent_via
     or old.direction is distinct from new.direction
     or old.contact_id is distinct from new.contact_id
     or old.conversation_id is distinct from new.conversation_id
     or old.channel_session_id is distinct from new.channel_session_id
     or (new.status = 'queued' and old.status is distinct from 'queued')
     or ((old.body is distinct from new.body
          or old.media_url is distinct from new.media_url
          or old.media_storage_path is distinct from new.media_storage_path
          or old.media_derived_text is distinct from new.media_derived_text)
         and not (old.direction = 'outbound' and old.sent_via in ('user', 'crm'))) then
    raise exception 'colunas_de_envio_da_mensagem' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.fn_mensagem_colunas_de_envio() from public, anon, authenticated;

-- ---- colunas do tronco do número (migration 0509) ----
-- Cadastrar número é reivindicar as ligações que chegam nele, e o tronco do
-- cadastro decide por onde elas podem chegar (lib/voip/tronco-de-chegada.ts).
-- O cadastro é da rota (que confere o tronco da organização e o da
-- instalação); pelo login não se troca o número, o tronco nem a organização
-- de uma linha. Rótulo, modo de atendimento e ligar/desligar seguem com o
-- gerente.
create or replace function public.fn_numero_colunas_do_tronco()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.number is distinct from new.number
     or old.trunk_endpoint is distinct from new.trunk_endpoint
     or old.organization_id is distinct from new.organization_id then
    raise exception 'colunas_do_tronco_do_numero' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.fn_numero_colunas_do_tronco() from public, anon, authenticated;

-- ---- autor da atividade gravada pelo login (migration 0509) ----
-- Atividade da linha do tempo gravada pelo login é de uma pessoa e em nome
-- dela (policy crm_lead_activities_insert_de_atendente). Quem não informa o
-- autor recebe o próprio usuário, em vez de uma linha sem dono; quem informa
-- outro é recusado pela policy, que roda depois deste gatilho.
create or replace function public.fn_atividade_do_login_tem_autor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.actor_kind := coalesce(new.actor_kind, 'user');
    new.performed_by_user_id := coalesce(new.performed_by_user_id, auth.uid());
  end if;
  return new;
end $$;
revoke execute on function public.fn_atividade_do_login_tem_autor() from public, anon, authenticated;

-- Contatos: pelo login, só atendente para cima cria, edita ou apaga (o leitor
-- reabria contato que pediu para sair, devolvia à IA conversa presa a humano e
-- trocava a base legal). As colunas de controle ficam com as rotas e RPCs donas
-- delas (gatilho abaixo; função antes da varredura de anon).
drop policy if exists contacts_insert_de_atendente on public.contacts;
create policy contacts_insert_de_atendente on public.contacts
  as restrictive for insert to authenticated
  with check (public.fn_role_at_least(organization_id, 'agent'));
drop policy if exists contacts_update_de_atendente on public.contacts;
create policy contacts_update_de_atendente on public.contacts
  as restrictive for update to authenticated
  using (public.fn_role_at_least(organization_id, 'agent'))
  with check (public.fn_role_at_least(organization_id, 'agent'));
drop policy if exists contacts_delete_de_atendente on public.contacts;
create policy contacts_delete_de_atendente on public.contacts
  as restrictive for delete to authenticated
  using (public.fn_role_at_least(organization_id, 'agent'));
drop trigger if exists trg_contato_colunas_de_controle on public.contacts;
create trigger trg_contato_colunas_de_controle
  before insert or update on public.contacts
  for each row execute function public.fn_contato_colunas_de_controle();
drop trigger if exists trg_mensagem_colunas_de_envio on public.messages;
create trigger trg_mensagem_colunas_de_envio
  before update on public.messages
  for each row execute function public.fn_mensagem_colunas_de_envio();

-- Barramento de eventos: a prévia de toda mensagem (até 280 caracteres) mora
-- no payload, e a leitura era de qualquer membro — inclusive da conversa que
-- ele não pode abrir. Quem lê pelo login (uso de IA, reenvio de automação) é
-- gerente, e o gerente vê toda conversa.
drop policy if exists event_log_leitura_de_gerente on public.event_log;
create policy event_log_leitura_de_gerente on public.event_log
  as restrictive for select to authenticated
  using (public.fn_role_at_least(organization_id, 'manager'));

-- Recibos de idempotência guardam a resposta da rota (o corpo da mensagem
-- enviada, por exemplo): cada um passa a ser de quem o criou. Recibo da service
-- role (token de servidor, MCP) não tem autor e não aparece para login nenhum
-- — a service role ignora RLS e segue lendo o seu. Recibo anterior a esta
-- versão também fica sem autor: reusar a chave dele nas 24h seguintes responde
-- "em curso" (nunca executa em dobro) até ele vencer.
alter table public.idempotency_keys add column if not exists created_by uuid default auth.uid();
drop policy if exists idempotency_do_proprio_autor on public.idempotency_keys;
create policy idempotency_do_proprio_autor on public.idempotency_keys
  as restrictive for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));


-- Linha do tempo do lead e demandas: o leitor registrava atividade (nota,
-- mudança de etapa, ligação) que a equipe e o agente leem como fato, e
-- escrevia o desfecho da demanda que o agente recebe como "histórico
-- encerrado". Atividade pelo login passa a ser de atendente para cima e em
-- nome de si mesmo (toda rota que a emite pelo login já exige atendente e
-- grava o próprio usuário; IA, sistema e automação gravam pela service role);
-- demanda e vínculo de demanda são
-- escritos só pelo servidor (rotas com service role e funções security
-- definer) — o membro segue lendo. Policy restritiva em vez de revoke: a
-- recusa continua sendo da RLS, que é o que demandas-rls.test.ts mede.
drop policy if exists crm_lead_activities_insert_de_atendente on public.crm_lead_activities;
create policy crm_lead_activities_insert_de_atendente on public.crm_lead_activities
  as restrictive for insert to authenticated
  with check (
    public.fn_role_at_least(organization_id, 'agent')
    and actor_kind = 'user'
    and performed_by_user_id = (select auth.uid())
  );
drop trigger if exists trg_atividade_do_login_tem_autor on public.crm_lead_activities;
create trigger trg_atividade_do_login_tem_autor
  before insert on public.crm_lead_activities
  for each row execute function public.fn_atividade_do_login_tem_autor();
drop policy if exists demandas_insert_so_servidor on public.demandas;
create policy demandas_insert_so_servidor on public.demandas
  as restrictive for insert to anon, authenticated
  with check (false);
drop policy if exists demandas_update_so_servidor on public.demandas;
create policy demandas_update_so_servidor on public.demandas
  as restrictive for update to anon, authenticated
  using (false);
drop policy if exists demandas_delete_so_servidor on public.demandas;
create policy demandas_delete_so_servidor on public.demandas
  as restrictive for delete to anon, authenticated
  using (false);
revoke truncate on public.demandas from anon, authenticated;
drop policy if exists demanda_conversas_insert_so_servidor on public.demanda_conversas;
create policy demanda_conversas_insert_so_servidor on public.demanda_conversas
  as restrictive for insert to anon, authenticated
  with check (false);
drop policy if exists demanda_conversas_update_so_servidor on public.demanda_conversas;
create policy demanda_conversas_update_so_servidor on public.demanda_conversas
  as restrictive for update to anon, authenticated
  using (false);
drop policy if exists demanda_conversas_delete_so_servidor on public.demanda_conversas;
create policy demanda_conversas_delete_so_servidor on public.demanda_conversas
  as restrictive for delete to anon, authenticated
  using (false);
revoke truncate on public.demanda_conversas from anon, authenticated;
-- Número de telefone: o cadastro é só da rota (service role), que confere o
-- tronco próprio da organização ou o da instalação liberado; pelo login, nem
-- inserir nem trocar número/tronco/organização (gatilho acima).
do $f$ begin
  if to_regclass('public.phone_numbers') is not null then
    drop policy if exists phone_numbers_insert_so_servidor on public.phone_numbers;
    create policy phone_numbers_insert_so_servidor on public.phone_numbers
      as restrictive for insert to anon, authenticated
      with check (false);
    drop trigger if exists trg_numero_colunas_do_tronco on public.phone_numbers;
    create trigger trg_numero_colunas_do_tronco
      before update on public.phone_numbers
      for each row execute function public.fn_numero_colunas_do_tronco();
  end if;
end $f$;
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
