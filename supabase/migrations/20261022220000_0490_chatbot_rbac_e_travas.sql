-- migration 0490 — Chatbot Builder: escrita por papel, servidor dono do estado,
-- travas do modo suporte
--
-- A 0486 deu às quatro tabelas uma policy ALL "membro da organização pode
-- tudo". Dois problemas, medidos pelos invariantes:
--   1. tabela nova não entra com policy ALL só-tenancy
--      (tests/invariants/rbac-config-ia-canais.test.ts): um `viewer` reescrevia
--      o fluxo falando direto com o PostgREST, embora a tela e a rota exijam
--      `manager`;
--   2. elas foram criadas depois da chamada de `fn_aplicar_travas_de_suporte`,
--      então uma sessão de suporte somente-leitura conseguia gravar nelas
--      (tests/invariants/travas-de-suporte-cobrem-toda-tabela-na-instalacao.test.ts).
--
-- Agora:
--   - chatbot_flows: qualquer membro lê; escrever exige `manager` (o mesmo da
--     rota /api/v1/chatbot-flows);
--   - chatbot_sessions, chatbot_nodes, chatbot_edges: membros só leem; quem
--     grava é o servidor (o motor no worker; nodes/edges estão sem uso desde a
--     0489). Sem privilégio de escrita para `authenticated`, as travas do
--     suporte as tratam como server-only;
--   - `anon` não alcança nenhuma das quatro;
--   - as travas do suporte são reaplicadas (idempotente).
-- Sem BEGIN/COMMIT (o runner já envolve em transação).

revoke all on public.chatbot_flows, public.chatbot_nodes, public.chatbot_edges, public.chatbot_sessions from anon;

-- chatbot_flows: leitura de membro, escrita de manager+
drop policy if exists tenant_isolation_chatbot_flows_all on public.chatbot_flows;
drop policy if exists chatbot_flows_leitura on public.chatbot_flows;
create policy chatbot_flows_leitura on public.chatbot_flows
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists chatbot_flows_escrita on public.chatbot_flows;
create policy chatbot_flows_escrita on public.chatbot_flows
  for all to authenticated
  using (organization_id in (select public.fn_user_org_ids())
         and public.fn_role_at_least(organization_id, 'manager'))
  with check (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'manager'));

-- chatbot_sessions / nodes / edges: só leitura para membros; escrita do servidor
do $$
declare t text;
begin
  foreach t in array array['chatbot_sessions', 'chatbot_nodes', 'chatbot_edges'] loop
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format('drop policy if exists %s_leitura on public.%I', t, t);
    execute format(
      'create policy %s_leitura on public.%I for select to authenticated
         using (organization_id in (select public.fn_user_org_ids()))', t, t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
  end loop;
end $$;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
