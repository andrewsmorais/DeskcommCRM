-- 0513 — favoritar mensagem (13/11/2026).
--
-- Paridade com a Umbler Talk: a equipe marca uma mensagem da conversa com
-- estrela para achar depois ("Favoritas" na busca da conversa). A marca é da
-- conversa (a equipe toda vê), como a estrela do WhatsApp num número de empresa.
-- Colunas, não `metadata`: a lista de favoritas é consultada por índice.
-- Idempotente.

-- ---- favoritar mensagem (migration 0513) ----
alter table public.messages add column if not exists favoritada_em timestamptz;
alter table public.messages add column if not exists favoritada_por uuid references auth.users(id) on delete set null;
comment on column public.messages.favoritada_em is
  'Quando a mensagem foi marcada com estrela na conversa (null = não favorita). Migration 0513.';
create index if not exists messages_favoritas_da_conversa
  on public.messages (organization_id, conversation_id, favoritada_em desc)
  where favoritada_em is not null;
