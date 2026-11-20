-- manifest: **Anexo na nota interna** (trazido do produto original: 0483 de lá). `conversation_notes` ganha `media_storage_path`, `media_mime` e `media_size_bytes`; bucket privado próprio `internal-media` (50 MB) — a nota nunca sobe no `whatsapp-media`, que é o bucket do canal do cliente. LGPD: o gatilho `fn_redigir_derivados_ao_anonimizar` (corpo da 0509 copiado inteiro), que já redigia o texto da nota, passa a mandar o anexo para a fila de remoção no bucket certo e a zerar as três colunas. A fila (`lib/lgpd/storage-redaction-queue.ts`) passa a aceitar `internal-media`. Apêndice no `baseline.sql`, antes da VARREDURA anon.

-- 0547 — anexo de imagem/arquivo na nota interna (era a 0483 do produto original).
--
-- A nota interna só tinha `body`: quem atendia não tinha onde guardar o print do
-- comprovante, o PDF do orçamento ou a foto do produto com defeito SEM mandar ao
-- cliente. O anexo mora num bucket PRÓPRIO, `internal-media`, por dois motivos:
--   · `whatsapp-media` é o bucket do canal do cliente, varrido por idade e por
--     órfão pela retenção de mídia — o print de ontem sumiria hoje;
--   · nada que mora ali passa pelo envio: a nota não vira mensagem.
--
-- LGPD: a nota é texto escrito SOBRE o titular, e o anexo é mídia da conversa
-- dele. O gatilho da 0509 já redigia o texto ao anonimizar; o corpo abaixo é o
-- da ÚLTIMA definição, copiado inteiro, e só o trecho do anexo é novo.

alter table public.conversation_notes
  add column if not exists media_storage_path text,
  add column if not exists media_mime text,
  add column if not exists media_size_bytes bigint;

comment on column public.conversation_notes.media_storage_path is
  'Caminho do anexo no bucket internal-media ({org}/{conversa}/note-...). Null = nota só com texto.';
comment on column public.conversation_notes.media_mime is
  'MIME real do arquivo GRAVADO (o do upload validado), não o que o browser declarou.';
comment on column public.conversation_notes.media_size_bytes is
  'Tamanho do arquivo gravado, em bytes — é o que o card mostra.';

insert into storage.buckets (id, name, public, file_size_limit)
values ('internal-media', 'internal-media', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

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
  -- O ANEXO da nota (migration 0547): o arquivo vai para a fila de remoção ANTES
  -- de a coluna ser zerada, no bucket CERTO (`internal-media` — a nota nunca
  -- sobe no `whatsapp-media`, que é o bucket do canal do cliente). Só caminho
  -- da própria organização: a fila recusa o resto (`alvoDaFilaValido`).
  insert into public.storage_redaction_queue (organization_id, bucket, object_path)
  select new.organization_id, 'internal-media', n.media_storage_path
    from public.conversation_notes n
   where n.organization_id = new.organization_id
     and n.conversation_id in (select c.id from public.conversations c
                                where c.organization_id = new.organization_id and c.contact_id = new.id)
     and n.media_storage_path is not null and length(n.media_storage_path) > 0
     and n.media_storage_path like new.organization_id::text || '/%'
  on conflict (bucket, object_path) do nothing;
  update public.conversation_notes
     set body = '[nota anonimizada]',
         media_storage_path = null,
         media_mime = null,
         media_size_bytes = null
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
