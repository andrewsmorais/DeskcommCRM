-- manifest: **Agenda com equipe — o compromisso convida pessoas da organização além do responsável.** Coluna `calendar_appointments.team_guest_user_ids uuid[] not null default '{}'` (índice GIN para o recorte "minha agenda"), gatilho `fn_appointment_team_guests_scope` que recusa id de quem não é membro ATIVO da organização e lista com mais de 20, `fn_google_projection_stamp` passa a contar a lista como mudança publicável (o convite chega ao Google e quem sai é desconvidado), e `fn_appointment_change_core` aceita a lista no patch (`[]` desconvida; ausente não mexe). O convidado NÃO vira responsável: carteira, distribuição e métricas seguem em `owner_user_id`. Trazida do produto original (9209, #4006), sem a parte "levar dados do negócio ao Google".
--
-- Por que gatilho e não só a rota: a coluna é `uuid[]` e array não aceita FK.
-- A rota já confere e responde com frase, mas qualquer outro escritor (MCP,
-- service role, import) gravaria em silêncio um id de outra organização — e o
-- worker do Google o resolveria num e-mail. O gatilho só confere quando a lista
-- MUDA: quem saiu da empresa depois de convidado não trava a edição de horário.

alter table public.calendar_appointments
  add column if not exists team_guest_user_ids uuid[] not null default '{}'::uuid[];

comment on column public.calendar_appointments.team_guest_user_ids is
  'Pessoas da ORGANIZAÇÃO convidadas para o compromisso, além do responsável (owner_user_id) e do e-mail digitado (guest_email). Não viram donas: carteira, distribuição e métricas continuam no owner_user_id. O worker do Google resolve cada id no e-mail da conta Google conectada (a saudável primeiro) ou, sem conta, no e-mail de login (migration 0561).';

create index if not exists idx_calendar_appointments_team_guests
  on public.calendar_appointments using gin (team_guest_user_ids);

create or replace function public.fn_appointment_team_guests_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and new.team_guest_user_ids is not distinct from old.team_guest_user_ids then return new; end if;
 if new.team_guest_user_ids is null then new.team_guest_user_ids:='{}'::uuid[]; end if;
 if coalesce(array_length(new.team_guest_user_ids,1),0)>20 then
  raise exception 'appointment_team_guests_invalid' using errcode='22023'; end if;
 if exists(select 1 from unnest(new.team_guest_user_ids) g(id)
   where not exists(select 1 from public.user_organizations m
     where m.organization_id=new.organization_id and m.user_id=g.id and m.revoked_at is null)) then
  raise exception 'appointment_team_guests_invalid' using errcode='22023'; end if;
 return new;
end; $$;
revoke all on function public.fn_appointment_team_guests_scope() from public, anon, authenticated;

drop trigger if exists trg_appointment_team_guests_scope on public.calendar_appointments;
create trigger trg_appointment_team_guests_scope before insert or update of team_guest_user_ids
  on public.calendar_appointments for each row execute function public.fn_appointment_team_guests_scope();

create or replace function public.fn_google_projection_stamp()
returns trigger language plpgsql security definer set search_path=public as $$
declare changed boolean; inbound boolean; decision boolean; redacted boolean;
begin
 redacted:=new.contact_id is not null and exists(select 1 from public.contacts where organization_id=new.organization_id and id=new.contact_id and is_anonymized);
 if redacted then
  new.google_base_projection:=null;new.google_conflict:=null;new.google_pending_write:=null;new.google_claim_token:=null;new.google_claim_until:=null;new.google_etag:=null;new.guest_email:=null;
  if tg_op='UPDATE' then new.google_claim_epoch:=old.google_claim_epoch+1;new.google_local_revision:=old.google_local_revision;new.google_synced_local_revision:=old.google_local_revision;end if;
  return new;
 end if;
 if tg_op='INSERT' then
  new.google_local_revision:=1;new.google_synced_local_revision:=0;
  if auth.uid() is not null then
   new.google_base_projection:=null;new.google_etag:=null;new.google_pending_write:=null;new.google_conflict:=null;
   new.google_claim_token:=null;new.google_claim_epoch:=0;new.google_claim_until:=null;
   new.google_connection_id:=null;new.google_calendar_id:=null;new.google_event_id:=null;
  end if;
  return new;
 end if;
 decision:=auth.uid()=old.owner_user_id and public.fn_role_at_least(new.organization_id,'agent') and public.fn_support_write_allowed(new.organization_id)
  and old.google_conflict is not null and new.google_conflict-'resolution'=old.google_conflict-'resolution'
  and new.google_conflict->'resolution'->>'actor_id'=auth.uid()::text
  and new.google_conflict->'resolution'->>'choice' in ('google','local','preserve_remote')
  and old.google_conflict->>'revision'=old.revision::text and old.google_conflict->>'local_revision'=old.google_local_revision::text
  and old.google_conflict->>'etag' is not distinct from old.google_etag;
 if auth.uid() is not null and (row(new.google_synced_at,new.google_sync_error) is distinct from row(old.google_synced_at,old.google_sync_error)
  or (new.google_next_attempt_at is distinct from old.google_next_attempt_at and not coalesce(auth.uid()=old.owner_user_id and public.fn_role_at_least(new.organization_id,'agent') and public.fn_support_write_allowed(new.organization_id)
    and new.google_next_attempt_at<=clock_timestamp() and (old.google_conflict is null or decision),false))) then
  raise exception 'google_metadata_private' using errcode='42501';end if;
 if auth.uid() is not null and ((new.google_conflict is distinct from old.google_conflict and not coalesce(decision,false)) or row(new.google_base_projection,new.google_pending_write,new.google_claim_token,new.google_claim_epoch,new.google_claim_until,new.google_synced_local_revision,new.google_etag,new.google_connection_id,new.google_calendar_id,new.google_event_id)
  is distinct from row(old.google_base_projection,old.google_pending_write,old.google_claim_token,old.google_claim_epoch,old.google_claim_until,old.google_synced_local_revision,old.google_etag,old.google_connection_id,old.google_calendar_id,old.google_event_id)) then
  raise exception 'google_metadata_private' using errcode='42501';
 end if;
 changed:=row(new.starts_at,new.ends_at,new.time_zone,new.status='cancelled',new.title,new.description,new.location_kind,new.location_details,new.guest_email,new.team_guest_user_ids)
  is distinct from row(old.starts_at,old.ends_at,old.time_zone,old.status='cancelled',old.title,old.description,old.location_kind,old.location_details,old.guest_email,old.team_guest_user_ids);
 -- Única entrada que modifica base e domínio juntos é o núcleo service-only.
 -- Não há GUC ou flag no body público que suprima revisão.
 inbound:=row(new.title,new.description,new.location_kind,new.location_details,new.guest_email,new.team_guest_user_ids) is not distinct from row(old.title,old.description,old.location_kind,old.location_details,old.guest_email,old.team_guest_user_ids) and auth.uid() is null and new.google_base_projection is distinct from old.google_base_projection
  and (new.google_base_projection->'shared'->>'starts_at')::timestamptz=new.starts_at
  and (new.google_base_projection->'shared'->>'ends_at')::timestamptz=new.ends_at
  and new.google_base_projection->'shared'->>'time_zone'=new.time_zone
  and (new.google_base_projection->'shared'->>'cancelled')::boolean=(new.status='cancelled');
 new.google_local_revision:=old.google_local_revision+case when changed and not coalesce(inbound,false) then 1 else 0 end;
 if changed then new.google_next_attempt_at:=now(); end if;
 return new;
end;$$;
revoke all on function public.fn_google_projection_stamp() from public,anon,authenticated;

create or replace function public.fn_appointment_change_core(p_org uuid,p_id uuid,p_revision bigint,p_patch jsonb,p_remote boolean,p_base jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.calendar_appointments; contact uuid; origin jsonb; event_id uuid;
begin
 if p_remote and (auth.uid() is not null or (p_patch-'starts_at'-'ends_at'-'time_zone'-'status'-'cancellation_reason')<>'{}'::jsonb or coalesce(p_patch->>'status','cancelled')<>'cancelled') then raise exception 'google_patch_forbidden' using errcode='42501';end if;
 if auth.uid() is not null and (not public.fn_role_at_least(p_org,'agent') or not public.fn_support_write_allowed(p_org)) then raise exception 'appointment_forbidden' using errcode='42501'; end if;
 if auth.uid() is not null and not public.fn_session_mfa_proven() then raise exception 'appointment_mfa_required' using errcode='42501';end if;
 -- A equipe convidada (0561): a forma é conferida aqui, para a recusa vir
 -- nomeada; quem é da organização é conferido pelo gatilho da coluna.
 if p_patch?'team_guest_user_ids' then
  if jsonb_typeof(p_patch->'team_guest_user_ids')<>'array' then raise exception 'appointment_team_guests_invalid' using errcode='22023'; end if;
  if jsonb_array_length(p_patch->'team_guest_user_ids')>20 or exists(
    select 1 from jsonb_array_elements_text(p_patch->'team_guest_user_ids') g
    where not exists(select 1 from public.user_organizations m where m.organization_id=p_org and m.user_id::text=lower(g) and m.revoked_at is null))
  then raise exception 'appointment_team_guests_invalid' using errcode='22023'; end if;
 end if;
 select contact_id into contact from public.calendar_appointments where organization_id=p_org and id=p_id;
 if not found then raise exception 'appointment_not_found' using errcode='P0002'; end if;
 if contact is not null then perform public.fn_service_lock(p_org,contact); end if;
 select * into a from public.calendar_appointments where organization_id=p_org and id=p_id for update;
 if a.contact_id is distinct from contact or a.revision is distinct from p_revision then raise exception 'appointment_stale' using errcode='40001'; end if;
 -- A AGENDA DO COLEGA É UMA OPÇÃO DA ORGANIZAÇÃO (migration 0343, issue #978).
 if auth.uid() is not null and not public.fn_role_at_least(p_org,'manager')
    and not public.fn_colegas_podem_mexer_na_agenda(p_org)
    and a.owner_user_id is distinct from auth.uid() then
  raise exception 'appointment_do_colega' using errcode='42501';
 end if;
 if p_remote and a.status not in ('pending','confirmed') then raise exception 'google_outcome_protected' using errcode='40001';end if;
 if a.status='cancelled' then raise exception 'appointment_cancelled' using errcode='22023'; end if;
 if contact is not null then origin:=jsonb_build_object('kind','command','observed',public.fn_service_observe_command(p_org,contact)); end if;
 update public.calendar_appointments set
  google_base_projection=case when p_remote then p_base else google_base_projection end,
  starts_at=case when p_patch?'starts_at' then (p_patch->>'starts_at')::timestamptz else starts_at end,
  ends_at=case when p_patch?'ends_at' then (p_patch->>'ends_at')::timestamptz else ends_at end,
  time_zone=coalesce(p_patch->>'time_zone',time_zone),
  status=coalesce(p_patch->>'status',status),
  cancelled_at=case when p_patch->>'status'='cancelled' then now() else cancelled_at end,
  cancellation_reason=case when p_patch?'cancellation_reason' then p_patch->>'cancellation_reason' else cancellation_reason end,
  notes=case when p_patch?'notes' then p_patch->>'notes' else notes end,
  guest_email=case when p_patch?'guest_email' then p_patch->>'guest_email' else guest_email end,
  team_guest_user_ids=case when p_patch?'team_guest_user_ids' then array(select q.id from (select lower(t.g) as id, min(t.ord) as primeira from jsonb_array_elements_text(p_patch->'team_guest_user_ids') with ordinality t(g,ord) group by lower(t.g)) q order by q.primeira)::uuid[] else team_guest_user_ids end,
  outcome_message_id=case when p_patch?'outcome_message_id' then (p_patch->>'outcome_message_id')::uuid else null end,
  confirmation_next_at=case when p_patch?'confirmation_next_at' then (p_patch->>'confirmation_next_at')::timestamptz else confirmation_next_at end
 where organization_id=p_org and id=p_id returning * into a;
 if p_patch?'confirmation_next_at' and (a.confirmation_next_at<=now() or a.confirmation_next_at>now()+interval '24 hours') then raise exception 'appointment_invalid_snooze' using errcode='22023'; end if;
 update public.followup_enrollments set status='cancelled',cancel_reason='O compromisso mudou. Revise o próximo passo.',completed_at=now(),next_eval_at=null,claimed_until=null
  where organization_id=p_org and appointment_id=p_id and appointment_revision<>a.revision and status in ('active','waiting_reply','paused_handoff','paused_manual');
 update public.agent_inbox_items set status='resolved',resolved_at=now()
  where organization_id=p_org and ref_kind='appointment' and ref_id=p_id and status='open'
   and (appointment_revision<>a.revision or a.status in ('completed','no_show','cancelled') or p_patch?'confirmation_next_at');
 if contact is not null and a.status='no_show' and a.outcome_recorded_at is not null and a.revision<>p_revision then
  insert into public.event_log(organization_id,event_type,entity_kind,entity_id,payload)
   values(p_org,'appointment.outcome_confirmed','appointment',p_id,
    jsonb_build_object('appointment_revision',a.revision,'service_origin',origin)) returning id into event_id;
 end if;
 return to_jsonb(a);
end; $$;
revoke all on function public.fn_appointment_change_core(uuid,uuid,bigint,jsonb,boolean,jsonb) from public,anon,authenticated;

notify pgrst, 'reload schema';
