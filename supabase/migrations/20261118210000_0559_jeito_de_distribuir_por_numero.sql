-- 0559 — Cada número com seu jeito de distribuir.
--
-- Até aqui o modo de distribuição (manual, rodízio, menor carga) era um só,
-- da organização (`organizations.settings.routing.mode`). Uma loja com um
-- número de vendas e outro de suporte não conseguia rodízio num e fila livre
-- no outro.
--
-- `channel_sessions.routing_mode`: NULL = segue a organização (o que todo
-- número já instalado continua fazendo). Preenchido, vale para as conversas
-- daquele número. Quem lê é o worker de roteamento (`lib/routing/worker.ts`).
--
-- Quem grava é `fn_set_channel_distribution_mode`, com as MESMAS travas de
-- `fn_set_channel_routing` (gerente para cima, suporte com escrita, MFA provado
-- na sessão). Ao mudar, acorda o roteamento das conversas sem dono do número.
--
-- Aditiva e idempotente: coluna nova nasce nula, então o CHECK não tem dado
-- antigo para recusar.

alter table public.channel_sessions add column if not exists routing_mode text;

alter table public.channel_sessions drop constraint if exists channel_sessions_routing_mode_check;
alter table public.channel_sessions add constraint channel_sessions_routing_mode_check
  check (routing_mode is null or routing_mode in ('manual', 'round_robin', 'least_load'));

comment on column public.channel_sessions.routing_mode is
  'Jeito de distribuir as conversas deste número. NULL = segue organizations.settings.routing.mode.';

create or replace function public.fn_set_channel_distribution_mode(p_org uuid, p_channel uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.fn_role_at_least(p_org, 'manager') or not public.fn_support_write_allowed(p_org)
  then raise exception 'routing_forbidden' using errcode = '42501'; end if;
  if not public.fn_session_mfa_proven() then raise exception 'routing_mfa_required' using errcode = '42501'; end if;
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
revoke execute on function public.fn_set_channel_distribution_mode(uuid, uuid, text) from public, anon;
grant execute on function public.fn_set_channel_distribution_mode(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
