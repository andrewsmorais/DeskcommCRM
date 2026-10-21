# Publicação do código local — 20/10/2026

O usuário escolheu a versão local do CRM como o conteúdo que deve substituir
a versão da branch principal de `andrewsmorais/DeskcommCRM`. Esta etapa publica
o código existente; não incorpora as atualizações posteriores do projeto original.

## Escopo

- Inclui as alterações locais de autenticação, planos, integração de pagamento,
  OpenAI, agentes, português, identidade visual e a documentação correspondente.
- Segredos, arquivos de ambiente reais, diretórios de execução, scripts
  temporários e capturas com informações privadas ficam fora da publicação.
  As referências a capturas omitidas são identificadas como evidência local
  não publicada.
- O rascunho `20261014000000_0483_billing_saas_schema.sql` não é incluído: está
  incompleto, sem a tripla migration, baseline e manifesto. Não é uma migration
  pronta para aplicação.
- O projeto separado da página de vendas não integra este envio.

## Limites desta etapa

Não houve nova execução de testes nesta etapa de publicação. Os resultados
anteriores e as pendências permanecem registrados no
[relatório geral](./2026-10-20-relatorio-geral-chatai-online.md), com suas datas
e escopos originais. Publicar o código não comprova que todas as jornadas do
produto estejam concluídas.

Esta etapa não executa migrations, não modifica dados ou credenciais do
Supabase e não realiza implantação na VPS. A confirmação do envio e da
substituição da branch principal depende do resultado efetivo das operações
no GitHub.
