-- manifest: **Contato pessoal e contato "sempre atendimento humano"** (vindo do produto original: 0563 e 0624 de lá). `contacts.is_personal` (ficha de vida pessoal: nada automático sai para ela — agente, prospecção, campanha) e `contacts.ai_opt_out` (a IA nunca responde e nenhuma devolução desfaz a marca; ligar também liga `force_human`), as duas `not null default false` com índice parcial. `campaign_recipients` ganha a saída `personal`. Idempotente.
--
-- 0540 — as duas marcas do contato que vetam o que é automático.

alter table public.contacts
  add column if not exists is_personal boolean default false not null;
comment on column public.contacts.is_personal is
  'Contato de vida pessoal: nada automático sai para ele (agente, prospecção, campanha). Só gerente/dono marca e desmarca, pela rota personal; quem/quando fica na auditoria.';
create index if not exists idx_contacts_org_personal
  on public.contacts (organization_id)
  where (is_personal = true);

alter table public.contacts
  add column if not exists ai_opt_out boolean default false not null;
comment on column public.contacts.ai_opt_out is
  'Contato "sempre atendimento humano": a IA nunca responde e NENHUMA devolução (manual ou automática) desfaz a marca — só um humano a desliga pela rota always-human. Ligar também liga force_human.';
create index if not exists idx_contacts_org_ai_opt_out
  on public.contacts (organization_id)
  where (ai_opt_out = true);

-- A saída de campanha de quem vira pessoal: status próprio, não `opted_out`
-- (inflaria a taxa de "pediu para parar" com quem nunca pediu).
alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_status_check;
alter table public.campaign_recipients
  add constraint campaign_recipients_status_check check (status in (
    'pending','queued','sending','sent','delivered','read','replied',
    'failed','skipped','cancelled','opted_out','personal'
  ));

notify pgrst, 'reload schema';
