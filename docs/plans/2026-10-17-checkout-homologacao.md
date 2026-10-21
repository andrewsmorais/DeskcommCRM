# Checkout — continuação da homologação local

Data: 17/10/2026, America/Sao_Paulo. Este registro complementa o histórico de
16/10; resultados antigos daquele histórico não descrevem necessariamente o
estado atual.

## Escopo preservado

- CRM principal: `D:/Antigravity/DeskcommCRM`, HEAD `856dec731` com o trabalho
  local já existente. A atualização do repositório foi cancelada pelo usuário
  em 17/10 e não foi aplicada ao checkout principal.
- Página e checkout existentes: `D:/Antigravity/Agente de vendas/web`.
- Somente Asaas Sandbox; sem cobrança real, publicação, migrations, exclusão de
  usuários/organizações ou alteração do design aprovado.
- As contas de homologação usam dados fictícios, notificações desativadas e
  nenhum telefone de cliente. Credenciais e dados de cartão não entram neste
  documento nem nas evidências.

## Correções focais de pagamento

1. Tokenização usa o endpoint oficial `creditCard/tokenizeCreditCard`, valida
   dados antes de criar cliente e normaliza o ano de validade.
2. O endereço de origem do cartão é obrigatório. A simulação local usa loopback
   somente em desenvolvimento, com URL exata do Sandbox e origem local. Cartão
   em produção permanece indisponível até existir uma fronteira confiável de
   proxy; cabeçalhos arbitrários não são tratados como IP confiável.
3. A consulta de cobrança pendente verifica o vínculo entre pagamento externo e
   assinatura da organização autenticada, mesmo antes de o webhook preencher
   `asaas_payment_id`. Uma organização não consulta a cobrança de outra.
4. `canceled_at` preserva o cancelamento da recorrência após eventos de atraso,
   estorno e confirmação. A confirmação não reativa silenciosamente o contrato.
   Uma reativação futura exigirá fluxo explícito e confirmação do provedor.

## Testes concluídos nesta rodada

Na página de vendas: **145 testes em cinco arquivos**, mais **19 casos de preços
e datas**, passaram. TypeScript e ESLint focal dos nove arquivos alterados
também passaram. São testes automatizados; a prova real abaixo é registrada
separadamente.

### Asaas Sandbox e Supabase reais

- Cartão: tokenização HTTP 200, checkout HTTP 200, situação inicial
  `trialing`/`PENDING`, confirmação pelo endpoint oficial de simulação,
  reapresentação autenticada ao webhook local e assinatura `active`.
- Pix: checkout HTTP 200, QR e copia e cola obtidos do provedor, consulta pendente
  autenticada HTTP 200, confirmação oficial simulada, webhook local HTTP 200 e
  assinatura `active`.
- Ambos: Essencial, dois atendentes, R$ 214 por mês; ciclo pago até 24/11/2026.
- Reentrega do evento financeiro sem duplicar a atualização. Consultas cruzadas
  entre as duas organizações retornaram 404 sem dados financeiros; consulta
  anônima retornou 401; consultas próprias retornaram 200.
- As comparações antes/depois confirmaram preservação dos três contratos já
  existentes. A integração Supabase confirmou as novas assinaturas de ensaio.
- Os dois pagamentos anteriores foram relidos como `BOLETO`/`RECEIVED`, com
  boleto, fatura e linha digitável disponíveis. Somente presença foi registrada;
  nenhum código ou documento financeiro foi copiado.

| Fixture | Organização                            | Assinatura Sandbox     | Pagamento Sandbox      |
| ------- | -------------------------------------- | ---------------------- | ---------------------- |
| Cartão  | `f8a9f162-ae4a-4071-b0a1-c00e49485f35` | `sub_ec2pp091xz4szo6w` | `pay_aw7sbw69ejokav52` |
| Pix     | `8856c7de-9483-42f6-83cd-488b9e0732fe` | `sub_crhkymk0skfqc3fs` | `pay_3pp8t26z8qpat9gp` |

Esta rodada usou replay autenticado do evento retornado pelo provedor. A prova
de **entrega automática**, já concluída em 16/10, está em
`evidence/planos-chatai-online/webhook-automatico-sandbox.json`. O túnel daquela
prova foi encerrado e seu webhook temporário desativado.

### Cancelamento pelo CRM

Apenas a nova fixture de cartão foi cancelada. A sessão SSR e o vínculo de
administrador foram validados; `POST /api/v1/billing/cancel` respondeu 200 e a
releitura no Asaas confirmou a recorrência encerrada. O Supabase manteve o
período pago até 24/11/2026, com `status=canceled` e `canceled_at` preenchido.

Reentregar a confirmação de pagamento não reativou a recorrência. O segundo
POST respondeu 200 sem nova escrita. A auditoria passou de zero para uma linha
e permaneceu em uma. O gate confirmou a conservação do acesso pago: a fixture
Essencial recebeu recusa por benefício de API ausente, não por assinatura
inativa. Nenhum token foi criado. Os três contratos anteriores e o Pix novo
permaneceram intactos, inclusive na conferência pela integração Supabase.

Evidências consolidadas: `evidence/planos-chatai-online/cartao-pix-sandbox-2026-10-17.json`
e `docs/plans/2026-10-17-homologacao-cartao-pix.md`.

## Servidor e navegação local

Foi restaurado somente o pacote já fixado
`@sentry/server-runtime-injection@11.0.0`: seus arquivos estavam ausentes na
instalação local. O tarball oficial foi confrontado com o SHA512 do lock antes
da restauração. `package.json`, lock e HEAD conservaram seus hashes; não houve
atualização de dependências. O cache de desenvolvimento anterior foi preservado
por renomeação, e o CRM reiniciou com pnpm 9.15.9.

O healthcheck e o cancelamento autenticado responderam 200. A conta antiga
continuou autenticada no navegador depois do reinício e da atualização completa
da página. Atrito, funil e desempenho por atendente carregaram, mas **o dashboard
não está integralmente validado**: o relatório de perdas depende da coluna
`crm_leads.lost_from_stage_id`, e a previsão depende de
`crm_stages.win_probability`; ambas estão ausentes no banco conectado. A
primeira falha foi confirmada também no erro HTTP real, e as duas ausências
foram conferidas em `information_schema.columns` pela integração Supabase.
Não foram inventados números nem aplicadas migrations para contornar a falha.

Inbox, Agenda e quadro Pedidos já tiveram prova visual no histórico anterior;
a Agenda ainda exige publicar horários e configurar a integração Google para
os respectivos recursos operacionais. Acesso à tela não comprova agendamento.

O typecheck canônico do CRM terminou com código zero. A regressão comercial
final passou: **609 testes em 47 arquivos**, em 284,55 segundos. Inclui os
casos de autenticação, cookies, marca, planos, pagamentos, privacidade e
credenciais. ESLint focal dos arquivos ajustados e a verificação focal do diff
também passaram; isso não declara limpo todo o trabalho anterior do checkout.

A suíte comercial usa valores fictícios, não carrega arquivos de ambiente e
bloqueia rede real. Os auxiliares de DOM foram compartilhados com o setup
unitário existente para conservar os mesmos contratos dos testes de interface.

## OpenAI

A preparação está em `docs/plans/2026-10-17-openai-preparacao.md`. O cadastro e a
validação da chave aguardam o retorno do usuário; nenhuma chamada paga foi feita
pelo agente. O ajuste da projeção
segura de credenciais resolve uma incompatibilidade comprovada do banco atual,
sem migration e sem alterar a chave AES existente.

O GET real de credenciais retornou a lista segura sem campos cifrados; a página
e o formulário existentes abriram na conta antiga. O formulário foi deixado com
OpenAI selecionado, nome preenchido e campo da chave vazio. Nada foi salvo ou
revalidado pelo agente. A reabertura após o ajuste de preenchimento automático
confirmou os campos vazios antes de preparar novamente o nome e o provedor.
Evidência visual da preparação do formulário: evidência local não publicada,
por privacidade.

O pedido posterior de copiar outro design foi cancelado pelo usuário. Nenhum
tema ou arquivo JSON de design foi aplicado; a identidade visual atual foi
preservada, inclusive no login.

## Limites para comercialização

Estes ensaios não comprovam todos os requisitos para venda pública. Continuam
pendentes a política de troca de plano de contrato vigente, o controle comercial
contra acesso direto ao banco, o contrato compartilhado entre unidades e a
operação dos benefícios de suporte. Não houve publicação em produção.
