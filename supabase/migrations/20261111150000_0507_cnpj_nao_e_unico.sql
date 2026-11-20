-- migration 0507 — o mesmo CPF/CNPJ pode ter mais de uma organização
--
-- `organizations.cnpj` era UNIQUE, mas nada prova que quem cadastra é dono do
-- documento: quem gravasse primeiro o CNPJ público de uma empresa travava o
-- cadastro dela (auditoria de 04/11/2026). Decisão de 11/11/2026, no modelo da
-- Umbler Talk, cujos termos não limitam contas por CPF/CNPJ: uma empresa pode
-- ter mais de uma conta (filial, outra marca). O que o documento ainda decide é
-- o teste grátis — um por documento —, conferido pela página de vendas.
--
-- Sai a constraint; fica um índice comum para a busca por documento.
-- Idempotente.
alter table public.organizations drop constraint if exists organizations_cnpj_key;
drop index if exists public.organizations_cnpj_key;
create index if not exists idx_organizations_cnpj on public.organizations (cnpj) where cnpj is not null;
