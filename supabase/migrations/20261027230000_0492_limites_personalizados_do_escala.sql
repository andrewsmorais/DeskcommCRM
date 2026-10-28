-- 0492 — Números da proposta do Escala, por organização.
--
-- O Escala não passa pelo checkout: o cliente conversa com o dono da plataforma,
-- que fecha a proposta e ativa o plano no painel de administrador. A proposta
-- pode subir números, agentes, chatbots, funis e usuários acima do pacote base
-- ("a partir de" na página). Os números moram na assinatura da organização,
-- lidos por `lib/billing/catalogo.ts#limitesEfetivos` — que só os aplica ao
-- Escala e nunca abaixo do pacote base.
--
-- Aditiva e idempotente. Só o servidor (service_role) escreve em subscriptions;
-- authenticated continua só lendo a própria (RLS da 0487).
alter table public.subscriptions
  add column if not exists limites_personalizados jsonb;

alter table public.subscriptions
  drop constraint if exists subscriptions_limites_personalizados_objeto;
alter table public.subscriptions
  add constraint subscriptions_limites_personalizados_objeto
  check (limites_personalizados is null or jsonb_typeof(limites_personalizados) = 'object');

comment on column public.subscriptions.limites_personalizados is
  'Escala: números da proposta (whatsapp, pipelines, agentes_ia, chatbots, usuarios). Ignorado nos outros planos.';
