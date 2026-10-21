# Homologação de cartão e PIX — 17/10/2026

## Escopo e ambiente

Prova de backend executada pela página local `http://127.0.0.1:3001`, usando
exclusivamente `https://api-sandbox.asaas.com`, o Supabase `chataionline` e
cadastros fictícios. Nenhum valor real foi movimentado. Não houve migration,
publicação, troca de senha, alteração de VPS ou mudança de interface.

O preflight encontrou somente os dois clientes sintéticos já conhecidos. Foram
criadas duas novas contratações independentes, com e-mails `@example.com`, sem
telefone no cadastro do cliente e com `notificationDisabled: true`. Os dados
públicos de cartão e titular usados na tokenização ficaram apenas em memória.
Não foram enviados e-mails nem mensagens.

## Resultado real

| Etapa | Cartão | PIX |
| --- | --- | --- |
| Tokenização oficial e handler local | 200, token válido | Não se aplica |
| Checkout local | 200, `trialing` | 200, `trialing` |
| Cobrança inicial | `PENDING`, vence em 24/10 | `PENDING`, vence em 24/10 |
| Consulta autenticada ainda pendente | 200 | 200 |
| QR e copia e cola | Não se aplica | 200, ambos presentes |
| Confirmação oficial simulada | 200, `CONFIRMED` | 200, `RECEIVED` |
| Webhook local autenticado | 200 | 200 |
| Reentrega do mesmo evento | 200, sem nova alteração | 200, sem nova alteração |
| Após liquidação no Supabase | `active` | `active` |

Ambas contrataram **Essencial, dois atendentes, R$ 214 por mês**, com período
pago de **24/10/2026 a 24/11/2026**. A integração Supabase confirmou os IDs da
assinatura e da cobrança, o plano, as vagas e o período final.

A autenticação para consultas usou exclusivamente as contas novas de
homologação, por link gerado e consumido pelo SDK sem envio de e-mail. Cada
conta leu o próprio pagamento com 200. A tentativa de consultar o pagamento da
outra organização retornou 404 nos dois sentidos, sem campos financeiros.
A consulta anônima retornou 401.

As comparações antes/depois confirmaram que a assinatura antiga e as duas
assinaturas de homologação anteriores não mudaram. As novas contas e
organizações foram preservadas.

Os runners temporários e seu estado foram removidos depois de salvar a evidência
sem credenciais. A página de vendas local permaneceu em execução; seus arquivos
de log de desenvolvimento foram mantidos fora do Git.

### Boleto: confirmação adicional somente de leitura

As duas cobranças anteriores, `pay_niq5562pivm83ymo` e
`pay_vycd46ltivb3rmnb`, foram relidas no Asaas: ambas são **BOLETO**, estão em
`RECEIVED` e responderam 200. Em ambas foram confirmadas somente como booleanas
a presença de página da fatura, URL do boleto, linha digitável e código de
barras. O endpoint de identificação também respondeu 200. Nenhum desses valores
foi impresso, salvo ou alterado; nenhuma nova contratação de boleto foi criada.
Isso complementa a cobertura real dos três meios de pagamento no Sandbox.

### Cancelamento real pelo CRM local

Após restabelecer o CRM na porta 3000, somente a nova assinatura de cartão foi
cancelada. A sessão da conta fictícia foi criada com o cookie canônico SSR,
validada por `getUser()` e conferida como administradora daquela organização.
Não foi usada senha da conta antiga.

O `POST /api/v1/billing/cancel` respondeu **200**. A leitura posterior do Asaas
confirmou `deleted: true`; não foi executado DELETE independente para simular
o handler. O Supabase ficou em `canceled`, com `canceled_at` preenchido e
**acesso pago até 24/11/2026**, sem mudar plano, vagas ou fim do período.

A reentrega manual de `PAYMENT_CONFIRMED` respondeu 200 sem ressuscitar a
recorrência. Um segundo POST de cancelamento respondeu 200 sem nova escrita.
A auditoria passou de zero para **uma** entrada e permaneceu com uma entrada.

Como diagnóstico do período já pago, um POST de corpo vazio ao cadastro de
tokens respondeu 403 `billing_feature`, próprio do Essencial sem API, e não
`billing_inactive`. O gate reconheceu o período ativo depois do cancelamento;
nenhum token foi criado. A integração Supabase confirmou `canceled` e uma
auditoria no cartão; a nova assinatura PIX continuou `active` e sem cancelamento.

Os hashes antes/depois confirmaram que a assinatura antiga, as duas fixtures
anteriores e a nova assinatura PIX ficaram intactas. Contas e organizações
foram preservadas.

## Identificadores para reconciliação

| Meio | Organização | Assinatura | Cobrança |
| --- | --- | --- | --- |
| Cartão | `f8a9f162-ae4a-4071-b0a1-c00e49485f35` | `sub_ec2pp091xz4szo6w` | `pay_aw7sbw69ejokav52` |
| PIX | `8856c7de-9483-42f6-83cd-488b9e0732fe` | `sub_crhkymk0skfqc3fs` | `pay_3pp8t26z8qpat9gp` |

Evidência sem credenciais, cartão, CPF, QR ou payload completo:
[cartao-pix-sandbox-2026-10-17.json](../../evidence/planos-chatai-online/cartao-pix-sandbox-2026-10-17.json).

## Correções provadas

- Endpoint oficial de tokenização, ano de quatro dígitos e validação completa
  antes de cadastrar cliente externo. Erros não registram dados do cartão.
- Consulta pendente autorizada pela assinatura retornada pelo Asaas e pela
  organização administrativa da sessão, mesmo com `asaas_payment_id` local nulo.
- Cancelamento preservado pelo campo `canceled_at` após atraso ou liquidação.
  Confirmação repetida do período estornado continua sem reativar acesso.
- Cadastro de organização sem a coluna legada `ai_budget_cents`, que não é o
  orçamento consumido pelo runtime. Nenhuma franquia de IA foi inventada.

As regressões reproduziram as falhas antes da correção. A rodada automatizada
passou em **145 casos Vitest, cinco arquivos, mais 19 casos de preços e datas**.
TypeScript e ESLint focal passaram. A interface, os preços e os benefícios
aprovados permaneceram intactos.

## Limites e próximo passo

Esta rodada usou **replay manual autenticado** dos pagamentos reais de Sandbox;
não abriu outro túnel. A prova automática anterior Asaas → receptor isolado →
handler local permanece no
[registro anterior](2026-10-16-planos-implementacao.md).

A prova de cancelamento fechou o ciclo de backend pela porta local real do
CRM. Não houve publicação nem atualização do repositório. As recusas, atraso e
estorno continuam cobertos pelos testes focais; esta rodada não simula todas
as condições comerciais das operadoras de produção.

Cartão em produção fica indisponível até existir uma origem segura da compra
atrás de proxy configurado. O IP fictício `127.0.0.1` só é aceito na combinação
desenvolvimento + Sandbox explícito + hostname local. Headers livres e campos
do formulário não são tratados como IP confiável. Não há alegação de prova
visual dos formulários nesta rodada nem de aprovação de cartão em produção.

## Conexões e operação

O fluxo existente liga `CheckoutModal` aos handlers de pagamento, ao SDK Asaas,
à tabela `subscriptions` e à tela Plano e cobrança. O retorno vem pelo webhook
e pela consulta autenticada; o cancelamento emite `billing.subscription_canceled`
na auditoria. Não foi criada uma superfície nova nem alterado o motor de IA.

Seleção e falhas continuam nas telas existentes. Reservas e mensagens de falha
impedem repetir cobrança sem conferir a tentativa. O mapa existente
`docs/architecture/planos-chatai-online.architecture.json` continua representando
as mesmas peças; estas correções ajustam suas conexões internas. Continuidade
IA–humano não se aplica a esta homologação financeira.

## Referências oficiais

- [Tokenização](https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito).
- [Assinatura com cartão](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito).
- [Fixtures e limites do Sandbox](https://docs.asaas.com/docs/faq-sandbox).
- [Confirmação simulada](https://docs.asaas.com/reference/confirmar-pagamento).
- [Identificação do boleto](https://docs.asaas.com/reference/obter-linha-digitavel-do-boleto).
