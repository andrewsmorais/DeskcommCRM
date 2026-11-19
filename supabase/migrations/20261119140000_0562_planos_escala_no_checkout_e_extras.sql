-- 0562 — Os três planos pelo checkout, os extras cobrados à parte e os avisos
-- da troca de plano (19/11/2026).
--
-- 1. `subscriptions.extras text[]`: os EXTRAS que o dono da plataforma ligou
--    para a organização (prospecção, ligações, nota de voz). Nenhum plano os
--    inclui — cada uso gasta dinheiro de fora. Só a service role escreve
--    `subscriptions` (o cliente só lê a dele), então ninguém se dá um extra.
--    O CHECK fecha o vocabulário: valor desconhecido não entra.
--
-- 2. `transactional_email_log.tipo` ganha os dois avisos da troca pedida:
--    `troca_agendada` (descida, vale no fim do período) e
--    `troca_aguardando_pagamento` (subida, espera a diferença).
--
-- 3. As frases e os números dos cards em `plans` (o mesmo texto da página de
--    vendas): o Escala deixa de ser "a partir de" e vira pacote fechado com
--    checkout, e as novidades entram na lista de cada plano. UPDATE por slug:
--    num banco sem essas linhas (instalação que não vende planos) não faz nada.
--    Os LIMITES que o CRM barra moram em `lib/billing/catalogo.ts`; a coluna
--    `limits` é só espelho para quem lê a tabela.
--
-- 4. A troca de plano aceita o Escala como destino (`subscriptions_troca_coerente`
--    só aceitava essencial e impulso, e o banco recusava a subida paga para o
--    Escala), e a assinatura guarda a cobrança da diferença JÁ aplicada
--    (`troca_aplicada_pagamento_id`) e o plano de antes dela, para o estorno ou a
--    contestação dessa cobrança suspenderem a conta em vez de deixarem o plano
--    maior de graça.
--
-- Idempotente: pode ser reaplicada sem mudar o resultado.

alter table public.subscriptions
  add column if not exists extras text[] not null default '{}';
alter table public.subscriptions
  drop constraint if exists subscriptions_extras_conhecidos;
alter table public.subscriptions
  add constraint subscriptions_extras_conhecidos
  check (extras <@ array['prospeccao','ligacoes','nota_de_voz']::text[]);
comment on column public.subscriptions.extras is
  'Extras cobrados à parte, ligados pelo dono da plataforma (lib/billing/extras.ts). Nenhum plano os inclui.';

alter table public.transactional_email_log
  drop constraint if exists transactional_email_log_tipo_check;
alter table public.transactional_email_log
  add constraint transactional_email_log_tipo_check check (tipo in (
    'boas_vindas','plano_contratado','plano_melhorado','plano_reduzido','reembolso',
    'escala_ativo','baseline','cancelamento','troca_agendada','troca_aguardando_pagamento'
  ));

update public.plans set
  limits = '{"api":false,"skills":false,"chatbots":1,"usuarios":2,"whatsapp":2,"campaigns":false,"pipelines":2,"agentes_ia":1,"agendamentos":true}'::jsonb,
  features = '["2 números de WhatsApp","1 agente de IA","1 chatbot","CRM com 2 funis","Agendamento pela IA e pelo chatbot","Agenda com Google Meet e aviso no seu WhatsApp","Chatbot completo com modelos prontos","Respostas rápidas com foto e áudio","Caixa de entrada compartilhada e chat da equipe","Radar de conversas e painel ao vivo","Base de conhecimento para a IA","IA que entende áudio e foto","IA passa a conversa para o atendente","Chat no site e aplicativo no celular","Relatórios essenciais"]'::jsonb
where slug = 'essencial';

update public.plans set
  limits = '{"api":true,"skills":true,"chatbots":2,"usuarios":4,"whatsapp":4,"campaigns":false,"pipelines":4,"agentes_ia":2,"agendamentos":true}'::jsonb,
  features = '["Tudo do Essencial","4 números de WhatsApp","2 agentes de IA","2 chatbots","CRM com 4 funis","Chatbot avançado","Follow-up automático","Agente que organiza o CRM sozinho","IA que responde em grupos","Automações com e-mail, foto e aviso à equipe","Comandas e propostas","Distribuição automática de leads","Skills e processos para agentes de IA","API e Webhooks","Relatórios completos e metas"]'::jsonb
where slug = 'impulso';

update public.plans set
  limits = '{"api":true,"skills":true,"chatbots":3,"usuarios":6,"whatsapp":6,"campaigns":false,"pipelines":6,"agentes_ia":3,"agendamentos":true}'::jsonb,
  features = '["Tudo do Impulso","6 números de WhatsApp","3 agentes de IA","3 chatbots","CRM com 6 funis","Distribuição por número e por time","Permissões avançadas e telefone oculto","Logs e auditoria","IA ligada ao banco de dados do seu sistema","Marca própria","Atendimento prioritário"]'::jsonb
where slug = 'escala';

alter table public.subscriptions
  add column if not exists troca_aplicada_pagamento_id text;
comment on column public.subscriptions.troca_aplicada_pagamento_id is
  'Id no Asaas da última cobrança de diferença que FOI aplicada (subida paga). O estorno ou a contestação dela suspende a assinatura.';

-- Dados fora da regra nova são limpos ANTES da constraint, para o update.sh de
-- um banco qualquer não quebrar.
update public.subscriptions
   set troca_plano = null, troca_tipo = null, troca_efetiva_em = null,
       troca_pagamento_id = null, troca_valor_cents = null, troca_link = null,
       troca_pedida_em = null
 where (troca_plano is null) <> (troca_tipo is null)
    or (troca_tipo is not null and troca_tipo not in ('upgrade', 'downgrade'))
    or (troca_plano is not null and troca_plano not in ('essencial', 'impulso', 'escala'))
    or (troca_valor_cents is not null and troca_valor_cents < 0);

alter table public.subscriptions drop constraint if exists subscriptions_troca_coerente;
alter table public.subscriptions
  add constraint subscriptions_troca_coerente check (
    (troca_plano is null) = (troca_tipo is null)
    and (troca_tipo is null or troca_tipo in ('upgrade', 'downgrade'))
    and (troca_plano is null or troca_plano in ('essencial', 'impulso', 'escala'))
    and (troca_valor_cents is null or troca_valor_cents >= 0)
  );
