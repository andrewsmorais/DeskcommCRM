-- 0518 — chat no site (14/11/2026).
--
-- Paridade com a Umbler Talk ("Chat no site" / webchat): um balão de conversa
-- que o cliente cola no próprio site com UMA linha de <script>. O visitante
-- escreve no balão, a conversa cai na Inbox como qualquer outra (rodízio,
-- agente de IA, etiquetas, funil) e a resposta do atendente aparece no balão.
--
-- O que muda no banco é só VOCABULÁRIO:
--
--   1. `channel_sessions.webchat_key` — o endereço PÚBLICO do balão (vai no
--      HTML do site, não é segredo). É a coluna de referência do provider
--      `webchat`, como `waha_session_name` é a do WAHA. Única entre as linhas
--      não arquivadas.
--   2. `channel_sessions_provider_check` e `_provider_ref_check` aceitam
--      `webchat` (e exigem `webchat_key` nele).
--   3. `conversations_channel_check` aceita `webchat`.
--
-- O visitante NÃO é tabela nova: ele é um contato com
-- `social_identity = 'webchat:<canal>:<hash do token do visitante>'`, e a
-- conversa guarda o mesmo hash em `provider_conversation_id`. O token em si
-- fica só no navegador do visitante; o banco guarda o SHA-256.
--
-- Idempotente. No baseline, as três constraints foram ampliadas NO BLOCO ÚNICO
-- de cada uma (regra de `tests/unit/baseline-constraint-reconstruida.test.ts`).

alter table public.channel_sessions
  add column if not exists webchat_key text;

comment on column public.channel_sessions.webchat_key is
  'Chave PÚBLICA do chat no site (provider webchat): vai no <script> que o cliente cola no site. Não é segredo. Migration 0518.';

create unique index if not exists channel_sessions_webchat_key_unique
  on public.channel_sessions (webchat_key)
  where webchat_key is not null and archived_at is null;

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'wacalls'::text, 'zernio_social'::text, 'datafy'::text, 'webchat'::text]));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'       and waha_session_name    is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id is not null) or
    (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
    (provider = 'wacalls'    and wacalls_session_id    is not null) or
    (provider = 'datafy'     and datafy_phone_number_id is not null) or
    (provider = 'webchat'    and webchat_key           is not null)
  );

alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel in ('whatsapp', 'instagram', 'facebook', 'webchat'));

notify pgrst, 'reload schema';
