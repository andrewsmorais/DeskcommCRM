-- E-mail de cancelamento da assinatura. O livro `transactional_email_log` tem um
-- CHECK com os tipos permitidos; 'cancelamento' entra na lista. Só alarga: toda
-- linha existente continua válida. Idempotente (drop + add do mesmo nome).
alter table public.transactional_email_log
  drop constraint if exists transactional_email_log_tipo_check;
alter table public.transactional_email_log
  add constraint transactional_email_log_tipo_check check (tipo in (
    'boas_vindas','plano_contratado','plano_melhorado','plano_reduzido','reembolso',
    'escala_ativo','baseline','cancelamento'
  ));
