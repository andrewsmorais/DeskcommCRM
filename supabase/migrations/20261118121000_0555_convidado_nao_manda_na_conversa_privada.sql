-- manifest: **Convidado não manda na conversa PRIVADA (auditoria de 18/11, achado 5).** As quatro travas restritivas da 0544 (UPDATE/DELETE de `conversations` e de `messages`) passam a usar a régua de visibilidade de TRÊS argumentos, com `is_private`: depois do convite, o colega lia a conversa privada pelo ramo de participante e a regra de dois argumentos (sem privacidade) deixava ele tirar a privacidade, assumir, fechar e apagar mensagens do dono. As quatro são re-criadas num bloco `do` só. A rota (`exigirControleDaConversa`) passa o `is_private` também. Idempotente; apêndice igual no `baseline.sql`.
-- ============================================================================
-- 0555 — LER NÃO É MANDAR, TAMBÉM NA CONVERSA PRIVADA
--
-- Auditoria de segurança de 18/11, achado 5. A 0544 pôs travas restritivas
-- para o convite ampliar só leitura e resposta. Só que elas usam
-- `fn_can_view_conversation(org, dono)` — a régua de DOIS argumentos, que não
-- conhece `is_private`. Com a visibilidade "todos" (ou numa privada sem dono),
-- ela é verdadeira para qualquer atendente; o convite torna a linha visível
-- pelo ramo de participante, e a trava deixava passar o UPDATE/DELETE. Medido:
-- o convidado tirava a privacidade (expondo o histórico a quem nunca foi
-- convidado), se atribuía a conversa, fechava e apagava mensagens do dono.
--
-- A régua de TRÊS argumentos é a mesma do SELECT e do `fn_conversation_assign`:
-- privada só para o dono, gerente/admin e o dono da plataforma.
-- ============================================================================

do $$
begin
  -- Num bloco só: o update.sh aplica sem ON_ERROR_STOP, e um create que
  -- falhasse depois do drop deixaria a tabela SEM a trava restritiva.
  drop policy if exists conversation_participant_read_is_not_control_update on public.conversations;
  create policy conversation_participant_read_is_not_control_update
    on public.conversations as restrictive for update to authenticated
    using (public.fn_can_view_conversation(organization_id, assigned_to_user_id, is_private))
    with check (true);
  drop policy if exists conversation_participant_read_is_not_control_delete on public.conversations;
  create policy conversation_participant_read_is_not_control_delete
    on public.conversations as restrictive for delete to authenticated
    using (public.fn_can_view_conversation(organization_id, assigned_to_user_id, is_private));
  drop policy if exists message_participant_reply_is_not_history_update on public.messages;
  create policy message_participant_reply_is_not_history_update
    on public.messages as restrictive for update to authenticated
    using (
      (sent_by_user_id = auth.uid() and direction = 'outbound' and sent_via in ('user','crm'))
      or exists (select 1 from public.conversations c
        where c.id = messages.conversation_id and c.organization_id = messages.organization_id
          and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private))
    ) with check (
      exists (select 1 from public.conversations c
        where c.id = messages.conversation_id and c.organization_id = messages.organization_id
          and (public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)
            or (messages.sent_by_user_id = auth.uid() and messages.direction = 'outbound'
              and messages.sent_via in ('user','crm'))))
    );
  drop policy if exists message_participant_reply_is_not_history_delete on public.messages;
  create policy message_participant_reply_is_not_history_delete
    on public.messages as restrictive for delete to authenticated
    using (exists (select 1 from public.conversations c
      where c.id = messages.conversation_id and c.organization_id = messages.organization_id
        and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)));
end $$;
