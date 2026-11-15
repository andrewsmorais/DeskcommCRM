-- 0525 — A reação não passa pelos gatilhos de mensagem recebida (vindo do
-- produto original, 0684 de lá).
--
-- A reação vira linha `type='reaction'` ligada ao alvo (`lib/channels/reacao.ts`)
-- e não carimba a conversa no aplicativo. Mas o INSERT em `messages` atravessa
-- gatilhos que tratam toda linha como mensagem recebida, e um 👍 reabria a
-- conversa encerrada e abria demanda nova (`trg_demanda_abre_no_inbound`),
-- emitia `message.received` — que acorda push, webhook de saída, campanha e
-- follow-up — (`trg_messages_emit_event`), somava +1 na revisão de contexto
-- (`trg_reply_inbound_revision`) e, neste produto, ainda reexibia a conversa
-- escondida até a próxima mensagem (`trg_reexibir_conversa_oculta`).
--
-- A cura é o corte `type = 'reaction'` no topo das QUATRO funções: a linha da
-- reação continua sendo gravada, só não conta como fala. `create or replace`,
-- sem tabela, coluna, policy ou dado novo; espelho no apêndice do baseline.

create or replace function public.fn_demanda_abre_no_inbound()
returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  -- A REAÇÃO NÃO É MENSAGEM RECEBIDA. Sem este corte, o INSERT da linha
  -- `type='reaction'` chamava `fn_service_inbound`, que reabre a conversa
  -- encerrada e abre uma demanda nova para um gesto que não é fala.
  if new.type = 'reaction' then
    return new;
  end if;
  perform public.fn_service_inbound(new.id);
  return new;
end; $fn$;
revoke execute on function public.fn_demanda_abre_no_inbound() from public,anon,authenticated;

create or replace function public.fn_emit_message_event() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $fn$
declare
  v_event text;
begin
  -- A reação não vira evento. O `type='reaction'` sai antes de escolher o
  -- evento: sem isto, a linha emitia `message.received` (ou, quando o operador
  -- reagia, `message.outbound`) e acordava push, webhook de saída, campanha e
  -- follow-up — consumidores que não filtram o tipo. Nenhum evento é a resposta
  -- certa: reação não é mensagem, e não existe evento de reação.
  if new.type = 'reaction' then
    return new;
  end if;
  if new.direction = 'inbound' then
    if exists (select 1 from public.conversations c
               where c.id = new.conversation_id and c.organization_id = new.organization_id and c.is_group) then
      v_event := 'message.group_received';
    else
      v_event := 'message.received';
    end if;
  else
    v_event := case new.status
                 when 'sending' then 'message.sending'
                 when 'sent' then 'message.sent'
                 when 'failed' then 'message.failed'
                 else 'message.outbound'
               end;
  end if;

  perform public.fn_log_event(
    new.organization_id, v_event,
    jsonb_build_object(
      'message_id', new.id, 'conversation_id', new.conversation_id,
      'contact_id', new.contact_id, 'direction', new.direction,
      'type', new.type, 'status', new.status, 'external_id', new.external_id,
      'channel_session_id', new.channel_session_id,
      'body_preview', "left"(new.body, 280)
    )
  );
  return new;
end$fn$;
grant all on function public.fn_emit_message_event() to anon;
grant all on function public.fn_emit_message_event() to authenticated;
grant all on function public.fn_emit_message_event() to service_role;

create or replace function public.fn_reply_inbound_revision() returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  -- A revisão de contexto é "o cliente falou de novo" — e a reação não é fala.
  -- Sem o corte, um 👍 somava +1 e invalidava o rascunho de resposta da tela à
  -- toa, além de contar junto com a reabertura (que este bloco também acabou de
  -- desligar).
  if new.direction='inbound' and new.type <> 'reaction' then
    update public.conversations set reply_context_revision=reply_context_revision+1 where organization_id=new.organization_id and id=new.conversation_id and contact_id=new.contact_id;
  end if;
  return new;
end;$fn$;
revoke all on function public.fn_reply_inbound_revision() from public,anon,authenticated;


create or replace function public.fn_reexibir_conversa_oculta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- A reação não é mensagem: um 👍 não traz de volta a conversa que a equipe
  -- escondeu "até a próxima mensagem".
  if new.direction = 'inbound' and new.type <> 'reaction' then
    update public.conversations
       set visibilidade = 'visivel'
     where organization_id = new.organization_id
       and id = new.conversation_id
       and visibilidade = 'oculta_ate_mensagem';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
