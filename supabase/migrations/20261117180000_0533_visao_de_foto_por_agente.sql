-- manifest: **O agente escolhe se vê as fotos do cliente** (vindo do produto original: 9108 de lá, adaptado). `ai_agent_versions.image_vision_enabled boolean not null default true` — LIGADA por padrão, então toda versão existente segue vendo foto como antes. Desligada, o agente não recebe a imagem nem a descrição dela no turno, só o aviso de que chegou uma foto que ele não viu; e a empresa cujos agentes publicados TODOS desligaram a opção deixa de pagar a descrição de foto no `media-derive-worker`. `fn_ai_agent_version_content_immutable` passa a cobrir `image_vision_enabled` e `inbound_debounce_ms` (este faltava desde a 0531: uma versão publicada ficava editável na espera). Corpo copiado da última definição em vigor mais as duas linhas. Idempotente.
--
-- 0533 — VISÃO DE FOTO POR AGENTE.

alter table public.ai_agent_versions
  add column if not exists image_vision_enabled boolean not null default true;

comment on column public.ai_agent_versions.image_vision_enabled is
  'Migration 0533. O agente vê as fotos que o cliente envia (descrição e imagem no turno). '
  'Desligado: recebe o aviso de que chegou uma imagem que não viu. Lido em '
  'lib/agent-engine/agent/agent-config.ts e em lib/messaging/media/visao-da-empresa.ts.';

create or replace function fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.followup               is distinct from old.followup
    or new.multimodal_input       is distinct from old.multimodal_input
    or new.video_frames_enabled   is distinct from old.video_frames_enabled
    or new.image_vision_enabled   is distinct from old.image_vision_enabled
    or new.split_messages         is distinct from old.split_messages
    or new.split_max_chars        is distinct from old.split_max_chars
    or new.cases_enabled          is distinct from old.cases_enabled
    or new.operator_enabled       is distinct from old.operator_enabled
    or new.operator_model         is distinct from old.operator_model
    or new.operator_tool_ids      is distinct from old.operator_tool_ids
    or new.pipeline_ids           is distinct from old.pipeline_ids
    or new.knowledge_source_ids   is distinct from old.knowledge_source_ids
    or new.inbound_debounce_ms    is distinct from old.inbound_debounce_ms
    or new.voz_enabled            is distinct from old.voz_enabled
    or new.voz_quando             is distinct from old.voz_quando
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;
