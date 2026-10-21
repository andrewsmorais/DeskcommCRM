# Planos ChatAI Online — implementação local e limites de validação

## Escopo e fonte

O responsável autorizou configurar planos, checkout Asaas e Supabase, mantendo
design e dados. A proibição anterior de modificar o checkout foi substituída por
essa autorização. VPS e publicação continuam fora desta etapa; migrations não
foram executadas.

A oferta aprovada está na página de vendas em `D:/Antigravity/Agente de vendas/web`.
`src/lib/planos.ts` é a fonte dos preços e mínimos para a vitrine e o checkout.
O servidor compara esses valores ao catálogo `public.plans` antes de efeitos.
`scripts/configurar-planos-chatai.sql` é o snapshot de configuração desse catálogo;
ele atualizou somente os três planos existentes no projeto `chataionline`.
`lib/billing/catalogo.ts` declara as capacidades comerciais do CRM; não contém preços.

| Plano     | Mensal/atendente | Trimestre/atendente | Ano/atendente | Mínimo |  WhatsApps |                       Funis ativos |
| --------- | ---------------: | ------------------: | ------------: | -----: | ---------: | ---------------------------------: |
| Essencial |           R$ 107 |              R$ 291 |      R$ 1.032 |      2 |          2 | 1, limite já existente no catálogo |
| Impulso   |           R$ 159 |              R$ 429 |      R$ 1.524 |      3 |          3 |                                  5 |
| Escala    |           R$ 234 |              R$ 633 |      R$ 2.244 |      3 | ilimitados |                         ilimitados |

Os valores do trimestre e ano são pelo ciclo inteiro. A cobrança multiplica pelo
número de atendentes humanos. Não foi criada franquia comercial de agentes de IA.

## Caminhos implementados

- `lib/billing.ts` lê a assinatura mais recente por organização, resolve catálogo
  por id ou slug e confere o prazo inclusive quando falta webhook de atraso.
- `lib/billing/acesso.ts` aplica a mesma autorização em rotas e execução de
  campanhas, agendamentos, skills, processos, distribuição e integrações.
- Inbox, Kanban, agentes, conhecimento e fluxos lineares permanecem no produto.
  O Essencial não publica nem executa ramificações/processos e skills avançados.
  Campanhas não autorizadas são pausadas; processos ficam pendentes com aviso
  no Inbox do agente. Consultas ao histórico não foram apagadas.
- `lib/billing/equipe.ts` conta vínculos humanos ativos e convites válidos sem
  duplicar o mesmo e-mail. `ai_operator` não ocupa vaga. Convidar, reenviar,
  aceitar e reativar usam a mesma reserva distribuída.
- `lib/billing/reserva.ts` usa a unicidade existente de `idempotency_keys`, em
  namespace próprio, para serializar contagem e criação. Não exige conexão SQL
  adicional. A liberação filtra também o hash aleatório do dono da reserva.
- Todos os bearers HTTP precisam do benefício API, inclusive quando declaram
  ator de IA. O agente nativo monta seu contexto internamente e conserva suas
  ferramentas básicas no Essencial.
- A tela existente `/app/settings/billing` mostra plano, ciclo, prazo, vagas,
  convites reservados e recursos incluídos. Falha de contagem não aparece como zero.

## Checkout e estados financeiros

O banco conectado aceita `trialing`, `active`, `past_due`, `suspended` e `canceled`;
não aceita `pending` e não tem unicidade por organização em subscriptions.
O checkout foi adaptado a esse contrato sem alterar schema: reserva uma linha
`suspended` com id determinístico da organização, usando a PK existente contra
duas tentativas simultâneas. A existência de assinatura anterior recusa uma
segunda contratação; não substitui um contrato vigente.

Depois da criação externa confirmada, a linha reservada passa a `trialing` por
sete dias. A gravação exige exatamente uma linha e não registra `sub_...` como
se fosse identificador de cobrança `pay_...`. Falhas parciais não apagam usuários,
organizações ou contratos e não repetem automaticamente cobranças externas.

O webhook autentica `asaas-access-token` e associa somente pelo identificador da
assinatura já armazenado. `SUBSCRIPTION_CREATED/UPDATED` e `PAYMENT_AUTHORIZED`
não comprovam pagamento. `PAYMENT_CONFIRMED/RECEIVED` libera o ciclo contratado;
atraso bloqueia novos efeitos premium; estorno e contestação suspendem.
O fim do período fica como marca de ordenação para que confirmação antiga não
desfaça estorno. Cancelar uma assinatura suspensa não a reativa. Escritas usam
CAS por situação e `updated_at`, com nova tentativa do webhook em conflito.

## O que ainda impede declarar a oferta integralmente validada

1. Login real, dashboard, agenda, Kanban, Inbox e sessão após atualizar ainda
   dependem de navegação autenticada. Resposta HTTP 200 não prova essa jornada.
2. Não houve compra real nem teste financeiro no sandbox do Asaas. O endpoint e
   o segredo do webhook do painel ainda precisam ser confrontados com o ambiente
   que será publicado; um servidor em loopback não recebe webhook público.
   A chave da API Asaas está ausente no ambiente local da página de vendas.
   O usuário escolheu Sandbox; o padrão de desenvolvimento foi preparado para
   ele. Cancelamento externo com 404 não altera o contrato local, porque um id
   do outro ambiente também pode produzir essa resposta.
3. Troca de plano de assinatura existente ainda não tem política de aplicação
   imediata/próximo vencimento nem fluxo completo. Hoje o checkout impede uma
   segunda assinatura e informa a necessidade de gerenciamento. Não anunciar
   o link de upgrade como troca automática comprovada.
4. “Multiunidade e multimarca” não está integralmente entregue: marca por
   organização existe e foi gateada, mas contrato compartilhado entre unidades
   não foi implementado. Atendimento Prime/VIP exige operação de suporte real.
5. Os bloqueios comerciais estão na aplicação. Acesso direto ao Supabase por
   uma conta autenticada continua sujeito às policies existentes, que não foram
   alteradas para impor o plano. Antes de venda pública, é necessário provar
   também essa fronteira e resolver os caminhos diretos que contornem as cotas.
6. A reserva distribuída tem prazo. Uma operação ainda em execução depois da
   expiração pode concorrer com outra. Não é uma constraint transacional de cota.
7. Não foi executada suíte de invariantes em PostgreSQL efêmero nem E2E em
   instalação fresca. Testes unitários simulam provedores e não geram cobranças.

## Living System Checklist

| Pergunta      | Artefato concreto                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Entrada       | Pricing/CheckoutModal, sessão validada, organização do bearer e eventos Asaas autenticados                        |
| Saída         | subscriptions → billing → guardas REST/MCP/workers; Plano e cobrança mostra o resultado                           |
| Registro      | auditoria original das mutações; `billing.subscription_canceled`; avisos de campanha/processo                     |
| Tela e porta  | Configurações → Plano e cobrança; Inbox do agente para processo pendente                                          |
| Próximo passo | erro legível com rota de cobrança; 409 pede retentar; 503 não libera efeito; pendência parcial pede reconciliação |
| Configuração  | catálogo existente + seleção da página, quantidade no checkout e configurações existentes do CRM                  |
| Continuidade  | passagem humana existente preservada; falha premium não apaga conversa, atendimento ou histórico                  |
| Retorno       | confirmação financeira atualiza situação/prazo; operador corrige configuração e retenta sem apagar dados          |
| Mapa          | `docs/architecture/planos-chatai-online.architecture.json`                                                        |

Os limites acima fazem parte do estado entregue. Nenhum teste isolado autoriza
declarar “CRM completo recuperado” ou “pronto para vender” sem as jornadas reais.

## Provas executadas nesta etapa

Rodada final reproduzível: `pnpm test:planos` passou em **43 arquivos e 588 casos**.
Inclui as regressões abaixo, os 12 casos da reserva nova e 29 casos do cliente
Asaas. Typecheck final do CRM passou com `--noEmit --incremental false`.

A página passou na suíte nativa inteira em **108 casos** (quatro arquivos),
incluindo a substituição dos simuladores antigos pelos handlers reais, e em
**19 casos** de preços/datas no Node. Typecheck da página também passou.

- Autenticação, vínculo, APIs e cotas: bloco de 22 arquivos passou em 258 casos
  antes de trocar a reserva SQL pela reserva PostgREST. A reserva nova passou
  em 12 casos próprios e teve prova real no Supabase: primeira aquisição,
  recusa 409 da concorrente e nova aquisição após liberar a própria reserva.
- Guardas comerciais, MCP, cancelamento, grafos e componentes: 86 casos passaram
  em dez arquivos. Campanhas tiveram cinco casos próprios do consumidor real,
  com envio simulado apenas no controle positivo autorizado.
- Identidade visual: 202 casos passaram em nove arquivos. Foram corrigidos os
  contratos obsoletos dos testes; nenhuma paleta, fonte ou composição foi trocada.
- Página de vendas: 52 casos de checkout/renderização passaram, além de 19
  casos de preços e datas em Node. Não houve chamadas financeiras reais.
- Typecheck do CRM e da página passou durante a implementação; novas execuções
  após os últimos ajustes devem ser conferidas no resultado da tarefa.
- Verificações focais de lint e `git diff --check` passaram; lint de canais e
  de papéis passou. Isto não é uma execução completa de `gov:verify`.

Servidor CRM iniciado em `http://127.0.0.1:3000`. Nesta reinicialização, `/app`
redirecionou 307 para `/login?next=%2Fapp`, e o endpoint de cobrança respondeu 401
sem sessão. A primeira compilação de `/login` ultrapassou o prazo da sonda.
A repetição elevada foi bloqueada por falha da revisão automática devido a limite
de uso; não constitui prova de segurança ou de disponibilidade. Login e navegação
autenticada continuam sem comprovação.

A revisão automática voltou a responder. A nova sonda confirmou **HTTP 200**
em `http://127.0.0.1:3000/login`. Isso confirma disponibilidade da tela nesta
execução, sem validar senha, sessão ou navegação das áreas autenticadas.

## Histórico da credencial Sandbox

O usuário escolheu Sandbox. Acesse `https://sandbox.asaas.com` e gere uma chave em
Integrações. A conta e a chave Sandbox são independentes da produção; o guia
oficial está em https://docs.asaas.com/docs/sandbox e a criação de credenciais em
https://docs.asaas.com/docs/chaves-de-api.

O valor posteriormente fornecido pelo usuário foi validado somente por uma
consulta GET no Sandbox. O serviço retornou **401**, sem autenticação. Nenhum
cadastro, assinatura ou cobrança foi criado e esse valor não foi salvo como
credencial. É necessário conferir a chave completa gerada na área de Integrações.

Após o usuário confirmar o valor completo, a segunda consulta retornou o código
específico **`invalid_access_token`**. O impedimento foi confirmado pelo provedor;
a integração não foi declarada autenticada.

Cadastre a chave diretamente no ambiente local da página de vendas e do CRM,
sem enviar seu valor pela conversa. Os templates `.env.example` documentam
`ASAAS_API_KEY` e `ASAAS_BASE_URL`; o template da página inclui o segredo do
webhook. A URL configurada neste código deve ser `https://api-sandbox.asaas.com`,
sem `/v3`, pois o cliente já acrescenta esse trecho.

Depois de cadastrar a chave e reiniciar os aplicativos, conferir a integração
financeira em uma organização própria de homologação, mantendo a assinatura
antiga intacta. Só então provar cadastro, pagamento simulado, permissões por
plano, atraso/estorno e cancelamento pela jornada real. O login existente e seus
dados ainda exigem a prova autenticada separada.

## Homologação com a credencial completa — 16/10/2026

A chave completa posteriormente fornecida foi aceita pelo Sandbox: a consulta
autenticada retornou **200**. Ela foi configurada em arquivos locais ignorados
pelo Git nos dois aplicativos, sem copiar credenciais para código ou documentos.
O carregamento normal de ambiente do Next foi conferido nos dois projetos.

As URLs `http://127.0.0.1:3000/login` e `http://127.0.0.1:3001/` responderam **200**.
Isso é prova HTTP de disponibilidade, sem substituir a prova de navegação visual.

O primeiro checkout real de homologação revelou uma incompatibilidade comprovada
com o banco existente: `asaas_customers` tem UNIQUE em `asaas_customer_id`, mas
não em `organization_id`. O upsert com esse alvo inválido falhava antes de criar
a assinatura externa. A correção usa INSERT com organização validada; conflito
de cliente já vinculado retorna 409 sem mover o registro de outra organização.
Não foi criada constraint nem executada migration.

A tentativa interrompida foi preservada para reconciliação: organização
`151557dd-38a5-4df7-9225-1ba72141b7ea`, reserva
`35639900-a085-4a2c-8267-736b3f601646`, cliente Sandbox
`cus_000009524037`. A reserva permanece suspensa, sem assinatura externa e sem
liberação comercial. Usuário e organização não foram apagados.

Quatro regressões foram acrescentadas aos testes da página. A prova anterior
reproduziu duas falhas; após a correção, os três arquivos focais passaram em
**103 casos**. Typecheck, ESLint focal, formatação e verificação de espaços da
rota também passaram.

Uma segunda contratação controlada passou pelo handler real do checkout:
Impulso trimestral, três atendentes, **R$ 1.287,00 por ciclo**, situação inicial
`trialing`. Organização `4a8be2da-caf8-4237-980c-80c41f168e14`, assinatura Sandbox
`sub_6lvh7s7qur4fi9al`, cliente `cus_000009524080`. Os clientes fictícios tiveram
notificações explicitamente desativadas e não receberam telefones reais.

A conta nova autenticou pelo SDK, gerando o cookie canônico do CRM. Três chamadas
autenticadas ao contexto próprio responderam 200, incluindo reutilização e
renovação da sessão. Esta prova é de backend e de conta de homologação; não
comprova login pela tela da conta antiga nem atualização de página no navegador.

A primeira chamada de prova da permissão de API ultrapassou 90 segundos durante
a compilação local. A assinatura foi mantida, sem repetir o checkout. A
continuação usou a mesma organização e a mesma cobrança: o endpoint oficial de
simulação do Sandbox confirmou `pay_vycd46ltivb3rmnb`, por **R$ 1.287,00**, em
situação `RECEIVED`. Nenhum valor real foi movimentado.

O pagamento efetivamente retornado pelo Asaas foi reapresentado ao webhook local
com seu segredo correto. O registro passou a `active`, com período de
**23/10/2026 a 23/01/2027**. A segunda entrega local do mesmo evento retornou 200
sem modificar `updated_at` ou o fim do período. Isto comprova processamento
local autenticado e idempotência; **não comprova entrega pública pelo Asaas**.

A prova de autorização foi concluída na mesma conta fictícia: o POST de criação
de token, com corpo vazio, passou pelo gate Impulso e recebeu **422
`validation_error`**, antes de criar qualquer token. Na continuação, a sessão
da conta fictícia foi obtida com link gerado e consumido pelo SDK, sem envio de
e-mail e sem alterar senha. A conta antiga não participou dessas chamadas.

A integração Supabase confirmou o estado final e os identificadores da cobrança.
As comparações antes/depois confirmaram que a assinatura antiga e a primeira
reserva suspensa permaneceram intactas. Os cadastros de homologação foram
preservados; os scripts temporários de execução foram removidos.

Nova rodada do CRM: **43 arquivos, 588 testes passaram** em 166,34 segundos.
Inclui testes de planos, autenticação e branding. A inspeção global do Git
encontrou espaços finais em alterações preexistentes de outros arquivos visuais;
essas alterações não foram corrigidas nem descartadas nesta homologação.

Rodada final completa da página: **112 testes em quatro arquivos**, mais
**19 casos de preços/datas**, passaram. Typecheck final do CRM passou sem erros;
o typecheck da página após a correção também passou. A verificação Git dos
arquivos desta correção e deste registro passou. Os dois arquivos locais de
credenciais foram confirmados como ignorados pelo Git.

Permanecem os limites de aceite já declarados: conta antiga pela interface,
navegação/refresh no navegador, entrega pública do webhook, upgrades de contrato
existente e validação das cotas contra acesso direto ao banco antes da venda.
O resultado desta rodada é homologação financeira de backend, não publicação
nem confirmação de que o produto inteiro já está pronto para comercialização.

## Recebimento automático e acesso da conta antiga — continuação de 16/10

O usuário autorizou comprovar a entrega automática e priorizou checkout/pagamento
durante sua ausência. Não foi necessário alterar VPS, publicar ou executar schema.

A revisão automática inicialmente recusou o túnel pela possibilidade de enviar
dados sensíveis à Cloudflare. Uma consulta apenas de leitura comprovou que a
conta Sandbox tinha exclusivamente os dois clientes fictícios desta tarefa,
sem telefones, com e-mails `@example.com` e notificações desativadas, uma assinatura
e um pagamento de homologação. A execução foi restringida a essa condição e
aprovada pela revisão automática. O script não iniciaria o túnel se encontrasse
qualquer cliente, assinatura ou pagamento fora das fixtures conhecidas.

Foi usado um receptor separado em loopback, com porta aleatória, rota exclusiva,
token temporário, limite de tamanho e lista de eventos/IDs permitidos. O túnel
não expôs as portas do CRM nem da página. O receptor encaminhava somente ao
handler local fixo, substituindo o token temporário pelo segredo local em memória.

Resultado real, sem replay manual:

- `SUBSCRIPTION_UPDATED` chegou automaticamente às 13:59:31 (Brasília) e o
  handler respondeu **200 em 281 ms**, sem alterar a assinatura existente.
- A primeira reserva interrompida foi reconciliada, preservando seu usuário e
  organização. Criou-se somente a recorrência fictícia que faltava:
  `sub_zfhlsrg81k71a2am`, cobrança `pay_niq5562pivm83ymo`, R$ 1.287,00 no Sandbox.
- Após a confirmação oficial simulada, o Asaas entregou `PAYMENT_RECEIVED`
  automaticamente às 13:59:37. O handler respondeu **200 em 375 ms**.
- O Supabase passou a reserva de `trialing` para `active`, mantendo Impulso,
  três atendentes e ciclo trimestral até **23/01/2027**. A integração Supabase
  confirmou o estado final. Nenhum dinheiro real foi movimentado.
- O webhook temporário `59f5a2ea-bf46-43b2-bed0-3b56a33eeafc` foi desativado e sua
  desativação foi relida no Asaas. O túnel e o receptor foram encerrados. A
  descrição usada no evento de transporte foi restaurada.
- As comparações completas confirmaram que a assinatura antiga e a outra
  assinatura de homologação não mudaram. Nenhum webhook preexistente foi alterado.

Evidência sem credenciais ou payloads completos:
`evidence/planos-chatai-online/webhook-automatico-sandbox.json` contém IDs,
horários, hash do corpo e respostas do handler. A URL temporária não constitui
configuração permanente: foi encerrada após a prova. Produção continua sem deploy.

O usuário entrou pessoalmente com a conta antiga na tela local, sem enviar senha
na conversa. Foram abertas pela interface a Inbox, Agenda, lista de funis e o
quadro Pedidos. Uma atualização completa manteve a sessão autenticada. A primeira
leitura do quadro excedeu o limite de dez segundos durante compilação local;
após atualizar, o quadro exibiu suas oito etapas existentes, sem mudar cartões.

Limitações operacionais visíveis: a Agenda informa que os horários de atendimento
ainda não foram publicados e que a sincronização Google não está configurada.
O acesso à tela foi comprovado; não foi criado agendamento nem alterada essa
configuração durante a prova.

A página também foi exercitada pela tela: Impulso trimestral mostrou R$ 1.287,00
para três atendentes e recalculou R$ 2.145,00 para cinco. A seleção voltou a três
e o meio boleto exibiu vencimento após os sete dias de avaliação. Não houve nova
contratação por esse formulário de inspeção.

### Correção focal do registro de credenciais em desenvolvimento

Durante a prova real de login, o terminal do Next registrou os argumentos da
Server Function de autenticação. Nenhum valor de credencial foi copiado para
estes documentos ou evidências. A causa foi confirmada no Next instalado:
`logging.serverFunctions` vem habilitado por padrão em desenvolvimento.

`next.config.ts` agora define explicitamente `logging.serverFunctions: false`,
preservando logs HTTP e a observabilidade existente. A regressão usa somente
sentinelas fictícias: confirmou o comportamento inseguro antes da configuração
e passou nos dois casos depois, incluindo a configuração final com Sentry.
O servidor reiniciou para aplicar a proteção; a recompilação local é demorada.

Essa proteção evita novos registros de argumentos; não remove o histórico já
emitido. Foi recomendado ao usuário trocar a senha após retornar. Nenhuma senha
foi redefinida por esta tarefa e nenhuma credencial real foi usada nos testes.
