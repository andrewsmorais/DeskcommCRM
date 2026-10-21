# ChatAI Online — relatório geral de execução e plano restante

Data de consolidação: **20/10/2026**. Este relatório reúne os registros de execução
de 15 a 20/10, o código local e as provas disponíveis. Não representa nova auditoria
completa nem certificação de produção. Resultados têm a data e o alcance da sua prova.

## 1. Resumo executivo

O projeto existente foi adaptado para a proposta comercial ChatAI Online: uma
empresa escolhe um plano na página de vendas, acessa seu CRM e configura agentes
para atendimento, vendas, suporte e agendamento. A Umbler foi usada como referência
de experiência e modelo de negócio; não foi prometida equivalência integral.

Há implementação e provas reais de pagamento no Asaas Sandbox, integração real
com a OpenAI, controles de plano e recuperação anterior do acesso. A revisão de
português e o novo tema violeta foram aplicados ao código. **O produto ainda não
está homologado de ponta a ponta para venda pública.**

| Área | Situação comprovada | O que falta |
| --- | --- | --- |
| Acesso da conta antiga | Login confirmado pelo usuário; navegação e persistência registradas nas etapas anteriores | Estabilizar disponibilidade local e repetir jornada final após as mudanças recentes |
| Planos | Catálogo, preços, limites e bloqueios comerciais implementados | Troca de plano vigente e fechamento dos limites descritos abaixo |
| Asaas | Boleto, Pix, cartão, webhook automático e cancelamento com provas em Sandbox | Checkout integral pela tela e preparação segura para produção |
| OpenAI | Chave validada; motor real respondeu e chamou ferramenta sintética | Agente salvo, conhecimento, agenda e WhatsApp em jornada completa |
| Separação entre empresas | Casos negativos de cobrança e credencial comprovados | Cobertura ampla de acesso a dados e cotas diretas no banco |
| Visual e português | Tema claro/escuro, fonte, componentes e textos de IA atualizados | Inspeção visual completa de módulos, login e celular |
| VPS | Preparação futura definida | Implantação ainda não realizada |

## 2. Onde o produto está

- CRM local: `D:/Antigravity/DeskcommCRM`.
- Página de vendas e checkout: `D:/Antigravity/Agente de vendas/web`.
- Projeto Supabase usado na execução: **chataionline**.
- Endereço local de trabalho: `http://127.0.0.1:3000`.
- Página de vendas usada na homologação: `http://127.0.0.1:3001`.

Os dois códigos continuam separados, conectados pelos fluxos comerciais e pelo
banco. Não houve unificação física em um único repositório. A aplicação local
usa os dados atuais do Supabase escolhido pelo proprietário; **rodar na máquina
local não transforma esse banco em uma cópia isolada da instalação existente**.
Alterações persistidas nesse banco podem aparecer nos outros ambientes que o usam.

A atualização do projeto original foi cancelada pelo proprietário. Não foi
aplicada ao checkout principal. Não houve publicação desta entrega na VPS.

## 3. Login, sessão e preservação da conta

### Trabalho realizado

- Preservada a correção de alinhamento dos cookies de autenticação entre navegador,
  servidor e proxy.
- Ajustados os retornos de autenticação para manter o endereço local aberto
  (`127.0.0.1`, `localhost` ou `::1`), evitando trocar de host durante o retorno.
- Corrigidos os erros de TypeScript nos testes de pipelines e marca do produto.
- Ajustados contratos de testes antigos de branding para refletir a marca própria.
- Mantida a conta existente e seu vínculo com a organização; não houve recriação
  do banco, remoção de organizações ou exclusão de usuários para permitir acesso.

### Provas e limite atual

O proprietário informou que entrou e abriu o dashboard. Existem capturas anteriores
da Agenda, Inbox, Kanban/quadro Pedidos e da sessão após atualizar. Em 17/10, o
registro também confirmou a sessão da conta antiga após reinício do servidor.

Em 20/10, a página `/app/ai/agents` abriu autenticada com o novo tema. A troca para
escuro funcionou e persistiu após atualizar, mantendo acesso à página. A captura
foi salva em `evidence/tema-violeta-2026-10-20/agentes-escuro.jpg`.

**Na consulta mais recente durante a elaboração deste relatório, o navegador
mostrou conexão recusada no endereço local.** Portanto, a disponibilidade atual
não deve ser anunciada como estável. Isso não comprova senha incorreta ou perda
do vínculo; exige recuperar o servidor e conferir a navegação novamente.

## 4. Planos comerciais configurados

Os preços e benefícios vieram da página de vendas do proprietário.

| Plano | Por atendente/mês | Trimestre inteiro por atendente | Ano inteiro por atendente | Mínimo humano | Total mensal mínimo | WhatsApps | Funis ativos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Essencial | R$ 107 | R$ 291 | R$ 1.032 | 2 | R$ 214 | 2 | 1 |
| Impulso | R$ 159 | R$ 429 | R$ 1.524 | 3 | R$ 477 | 3 | 5 |
| Escala | R$ 234 | R$ 633 | R$ 2.244 | 3 | R$ 702 | Ilimitados | Ilimitados |

O limite de um funil do Essencial já existia no catálogo técnico; não foi inventado
como nova oferta. Os totais trimestrais mínimos são R$ 582, R$ 1.287 e R$ 1.899;
os anuais, R$ 2.064, R$ 4.572 e R$ 6.732. A cobrança multiplica o preço do ciclo
pelo número de atendentes humanos. O operador de IA não ocupa uma vaga humana.

### Benefícios e implementação

- **Essencial:** Inbox compartilhada, Kanban, fluxos lineares, agentes, base de
  conhecimento e relatórios essenciais.
- **Impulso:** anteriores, agendamento, processos/fluxos avançados, campanhas,
  distribuição automática, skills, API, webhooks e relatórios completos.
- **Escala:** anteriores, distribuição e permissões avançadas, auditoria,
  integrações avançadas e multimarca. Multiunidade e suporte Prime/VIP continuam
  com pendências de entrega operacional indicadas abaixo.

O catálogo existente foi atualizado. O checkout confere preços e mínimos com o
banco antes de criar efeitos. A tela **Configurações → Plano e cobrança** apresenta
plano, ciclo, prazo, vagas, convites e benefícios.

Foram adicionados controles comerciais às rotas, ferramentas e execução de
campanhas, agenda, processos, skills, distribuição e integrações. Convites válidos
reservam vagas sem duplicar o mesmo e-mail. A reserva distribuída reduz disputas
entre operações simultâneas. Recursos restritos pelo plano não apagam o histórico.

Foi implementada avaliação inicial de sete dias. A condição comercial preservada
é teste grátis, cancelamento e ausência de taxa de setup. Não foi criada uma
franquia comercial nova de IA, carteira de créditos ou cobrança por consumo.

### Pendências dos planos

1. Definir e implementar upgrade/downgrade de contrato vigente, incluindo data de
   vigência e regra financeira. Hoje o checkout impede uma segunda assinatura.
2. Provar e reforçar cotas contra acesso direto ao Supabase. Os controles comerciais
   implementados ficam na aplicação e não substituem esse trabalho no banco.
3. A reserva tem prazo e não equivale a uma restrição transacional definitiva de cota.
4. Concluir contrato compartilhado entre unidades. Multimarca por organização
   não comprova uma gestão completa de várias unidades no mesmo contrato.
5. Definir a operação humana de suporte Prime/VIP e provar os cenários de chat
   personalizado prometidos. A existência de API não demonstra toda integração.

## 5. Checkout e Asaas

### Correções realizadas

- Credencial de **Sandbox** configurada nos ambientes locais, após a chave correta
  ser validada. Nenhum segredo está neste relatório.
- Adequação ao schema existente de clientes e assinaturas, corrigindo conflitos
  de gravação sem apagar contratos.
- Reserva de contratação para evitar duplicidade concorrente e substituição
  silenciosa de uma assinatura em vigor.
- Tokenização no endpoint correto; validação do cartão e normalização do ano.
- Consulta de pagamento pendente autorizada pelo vínculo da assinatura com a
  organização autenticada, inclusive antes de o webhook completar o registro local.
- Webhook autenticado e associação pelo identificador da assinatura já armazenado.
- Criação de assinatura e autorização de cartão não são confundidas com pagamento.
- Confirmação/recebimento ativa o período; atraso limita novos efeitos premium;
  estorno e contestação suspendem conforme o tratamento implementado.
- Reentrega de eventos protegida contra duplicação e reativação indevida.
- Cancelamento preserva o período pago e não é revertido por confirmação repetida.

### Provas reais em Sandbox

| Prova | Resultado e alcance |
| --- | --- |
| Boleto | Contratação Impulso trimestral para três atendentes: R$ 1.287/ciclo; confirmação simulada oficial e atualização do plano |
| Webhook automático, 16/10 | Asaas → receptor temporário isolado → handler local; eventos recebidos com HTTP 200 e ativação no Supabase |
| Cartão, 17/10 | Tokenização, contratação e confirmação simulada oficial; assinatura ativada |
| Pix, 17/10 | QR/copia e cola, consulta pendente e confirmação simulada oficial; assinatura ativada |
| Cancelamento pelo CRM | Recorrência fictícia de cartão encerrada no Asaas; período pago preservado; uma única entrada de auditoria |
| Isolamento financeiro | Consulta própria 200; consulta cruzada entre organizações 404 sem dados; anônima 401 |

Cartão e Pix foram ensaiados no Essencial com dois atendentes, R$ 214/mês. Os
eventos de 17/10 foram reapresentados manualmente com autenticação; a entrega
automática é uma prova separada de 16/10. O túnel temporário foi encerrado e seu
webhook desativado após a prova.

Não houve dinheiro real. Os contratos antigos foram comparados e preservados.
As provas não representam homologação das operadoras em produção. O fluxo inteiro
de compra pela interface ainda precisa de comprovação final, além dos testes do
servidor e das inspeções anteriores de seleção/resumo dos planos.

Cartão em produção exige identificar a origem da compra por proxy confiável.
Permanece indisponível sem essa configuração. O webhook público permanente será
configurado e validado quando a implantação for autorizada.

## 6. OpenAI e configuração dos agentes

### Trabalho realizado

- Corrigida a leitura das credenciais para compatibilidade com a view segura
  existente do Supabase.
- Corrigida a confirmação de salvamento: a tela só anuncia sucesso após sucesso
  do servidor; erro conserva o formulário e explica a falha.
- Protegido o campo de chave contra preenchimento automático da senha de login.
- Lista de credenciais mantém o valor secreto cifrado e apresenta apenas seu final.
- Na última conferência funcional de 19/10, restava uma única credencial da
  organização: **OpenAI ChatAI Online**, ativa e validada, com 133 modelos listados.
- Modelo padrão selecionado na interface: **OpenAI / GPT-5.4 Nano**.
- Painel de provedores corrigido para informar o modelo real de embeddings:
  `text-embedding-3-small`, com 1536 dimensões.
- Criação de agentes ganhou pontos de partida para atendimento, vendas, suporte
  e agendamento, preservando o editor completo, funis e materiais existentes.
- Prévia identifica falta de conexão ao banco com erro específico e remove
  segredos/URLs sensíveis de mensagens de falha.
- Argumentos privados de funções do servidor deixaram de ser registrados nos
  logs locais. Essa proteção não apaga registros antigos.

### Banco e conexão local

A senha candidata do banco não funcionou. A senha original não foi redefinida.
Após autorização, foi preparada uma conexão técnica local, com TLS, validação
do certificado/hostname, limite de conexões e timeouts.

Foi aplicada e conferida a migration existente `0463_proposta_ai_draft_enabled`
após o proprietário autorizar migrations. Isso não significa que todo o histórico
de schema tenha sido aplicado ou que todas as divergências do banco foram resolvidas.

Essa conexão técnica pode assumir uma função privilegiada que ignora RLS. Assim,
os filtros de organização no servidor são indispensáveis; a existência dessa
conexão não comprova isolamento automático pelo banco.

### Testes reais de IA

- Motor canônico com chave salva e banco real: resposta esperada de texto,
  persistência dos tokens e custo registrados.
- Ferramenta sintética em memória: chamada uma vez pelo modelo, retorno utilizado
  na resposta e execução em duas etapas.
- Credencial de outra organização: recusada antes de chamar a OpenAI.
- Duas execuções positivas em 19/10 produziram três requisições reais HTTP 200
  à API Responses. Não foram apenas consultas de validade de chave.
- Embedding real: 1536 dimensões, aprovado.
- Transcrição de áudio sintético: frase reconhecida, aprovado.
- Visão: primeira tentativa errou a cor da imagem; contraprova com outro modelo
  e imagem maior acertou. Como mais de uma variável mudou, não há causa isolada
  comprovada para a melhora nem garantia geral de acerto.

**Conclusão:** a chave funciona e está integrada ao motor real. Isso ainda não
equivale a um agente comercial completo atendendo pelo WhatsApp.

### O que ainda falta provar na IA

Na conferência de 19/10 não havia versão de agente salva nem WhatsApp de teste
conectado para a jornada. A lista vista em 20/10 também estava vazia nos filtros
abertos. Falta concluir pela tela: salvar agente, selecionar capacidades, testar
conhecimento e ferramentas reais, publicar de forma controlada e verificar o canal.

Agendamento exige disponibilidade e compromisso reais; ferramenta sintética não
prova isso. Base de conhecimento exige ingestão, busca e resposta. Passagem humana
exige contexto no Inbox, silêncio da IA durante atendimento humano e retomada
correta. Orçamento e limite real de consumo também precisam de ensaio; o orçamento
estava desativado na conferência funcional.

## 7. Módulos do CRM e limites de validação

O trabalho aproveitou os módulos existentes: Inbox, contatos, funis/Kanban,
agenda, tarefas, agentes, conhecimento, follow-ups, campanhas, roteamento,
conexões, relatórios, equipe, permissões, auditoria e configurações.

Esses módulos não foram todos construídos nesta conversa. A existência de uma
tela ou rota não comprova que todo recurso esteja configurado para esta empresa.

- **Inbox/Kanban/Agenda:** há provas anteriores de abertura; operação completa
  com canal e agendamento ainda precisa dos ensaios descritos acima.
- **Dashboard:** prova parcial. Em 17/10, perdas e previsão dependiam de
  `crm_leads.lost_from_stage_id` e `crm_stages.win_probability`, ausentes no banco.
  Não foi localizada prova posterior de correção desses dois pontos. Devem ser
  rechecados antes de considerar todos os relatórios prontos.
- **Google Agenda:** requer configuração e prova própria. Agenda interna aberta
  não comprova sincronização com o Google.
- **Integrações anunciadas na vitrine:** logos e textos não equivalem a integrações
  homologadas nesta instalação; cada integração prometida precisa de validação.

## 8. Segurança e separação de clientes

Foram implementadas ou preservadas validação de sessão, vínculo de organização,
permissões, filtros, assinatura de eventos e trilhas de auditoria nos caminhos
trabalhados. As provas reais cobriram isolamento de consultas financeiras e
recusa de credencial de IA de outra organização.

Há um guia local de auditoria em `.agents/skills/security-audit`, disponível para
orientar a revisão. **Não foi concluída uma auditoria integral de segurança do aplicativo.** Não há
base para declarar que todo caminho de dados entre clientes está comprovado.

Antes de vender, devem ser medidos cenários com duas organizações independentes
em contatos, conversas, agenda, arquivos, agentes, conhecimento, métricas e
cobrança, além das permissões de membro/gestor/admin e dos acessos privilegiados.
Também faltam invariantes de banco em ambiente descartável e a jornada de uma
instalação nova. As provas focais existentes não substituem essas etapas.

## 9. Novo visual e português

O pedido final vigente autorizou corrigir o português e aplicar o tema violeta
claro/escuro da referência FlowDash. Isso substituiu o cancelamento visual anterior.

### Aplicado ao código

- Fonte **Plus Jakarta Sans**, carregada localmente.
- Paleta clara/escura, superfícies, bordas, sombras e destaque violeta.
- Menu lateral de 240px e cabeçalho de 64px.
- Cartões de 16px e controles de 10px de raio.
- Estado ativo do menu com cor, texto e marcador lateral; foco de teclado mantido.
- Login, cadastro e recuperação usando o tema compartilhado, com seletor de tema.
- Ajustes de altura no Inbox e quadro de funil e cores semânticas em gráficos.
- Logo e nome ChatAI Online e resolvedores de marca própria preservados.
- **“Agentes de IA”** corrigido e revisão de mensagens, filtros, edição, versões,
  testes e follow-ups da área de IA. Traduções espanholas correspondentes mantidas.
- JSON da referência salvo em `docs/design/flowdash-reference.json` e documentação
  em `docs/design/tema-violeta.md`.

A imagem foi adaptada às funções reais, sem inserir números ou projetos fictícios.
Não se declara reprodução pixel a pixel a partir de uma imagem.

### Conferência atual

Typecheck aprovado; lint focal sem erros, com três avisos preexistentes no menu;
verificação focal do diff aprovada. A página de Agentes foi conferida visualmente
nos dois temas e a persistência após atualização foi comprovada.

A revisão visual completa de login, outras áreas e celular ainda está aberta.
O HTTP 200 observado no servidor para Inbox não foi tratado como prova visual.
Nenhuma suíte completa de interface foi executada nesta rodada do tema.

## 10. Ferramentas para economizar tokens

Foram instaladas as skills dos dois repositórios solicitados:

- `JuliusBrussee/caveman` → `C:/Users/andre/.codex/skills/caveman`.
- `Shawnchee/caveman-skill` → `C:/Users/andre/.codex/skills/caveman-shawnchee`.

Elas orientam respostas mais curtas. Não alteram o CRM, planos, preços ou provedor
de IA do produto. Não foi medida uma porcentagem de economia. A comunicação deve
continuar clara em português, preservando resultados e limitações importantes.

## 11. Testes e evidências consolidados

As execuções abaixo têm sobreposição. **Não devem ser somadas como testes únicos
do aplicativo nem anunciadas como uma única rodada.**

| Data/área | Resultado registrado | Limite |
| --- | --- | --- |
| Autenticação inicial | 57 testes, conforme histórico da recuperação | Cobertura focal; depois incluída em seleções maiores |
| 17/10 — CRM comercial | 609 testes em 47 arquivos | Dados fictícios, rede bloqueada; não toda a suíte do repositório |
| 17/10 — página/checkout | 145 testes em 5 arquivos + 19 casos de preços/datas | Separados das chamadas reais ao Sandbox |
| 17/10 — configuração OpenAI | 415 testes em 45 arquivos | Seleção focal, provedores simulados |
| 19/10 — OpenAI | 414 testes em 44 arquivos + complemento de 1 teste em 1 arquivo | União de 415 casos distintos em duas execuções |
| 20/10 — visual | Typecheck; lint focal zero erros/3 avisos antigos; diff focal aprovado | Inspeção visual completa ainda pendente |
| 16–17/10 — financeiro real | Sandbox, Supabase, webhook, cancelamento e consultas cruzadas | Sem produção/dinheiro real |
| 17–19/10 — IA real | Texto, ferramenta sintética, embeddings, áudio e contraprova de visão | Sem jornada WhatsApp/agenda real concluída |

Não foi declarada aprovação global de `gov:verify`, invariantes RLS, build e E2E
de instalação fresca para o estado final deste checkout.

## 12. Plano restante, em ordem de execução

| Ordem | Entrega | Critério concreto de conclusão |
| --- | --- | --- |
| 1 | Estabilizar CRM local | Servidor disponível, login da conta antiga, navegação e atualização sem interrupção |
| 2 | Fechar visual e português | Login, dashboard, Inbox, Agenda, Kanban, agentes e cobrança conferidos em claro/escuro e celular |
| 3 | Fechar configuração do agente | Versão salva pela tela; objetivo, modelo, conhecimento e ferramentas corretos; prévia real aprovada |
| 4 | Provar operação da empresa | Atendimento, vendas, agenda, falha e passagem humana; resultado correto e visível no CRM |
| 5 | Provar canal controlado | WhatsApp de teste recebe, responde e entrega mídia/continuidade sem tocar clientes reais |
| 6 | Fechar oferta e cobrança | Compra completa pela tela, estados financeiros, cotas, upgrade/downgrade e benefícios pendentes definidos/entregues |
| 7 | Fechar isolamento e regressões | Duas organizações sem acesso cruzado, permissões corretas, banco e instalação fresca verificados |
| 8 | Preparar implantação | Revisar alterações acumuladas, backup/retorno, ambientes, domínio, TLS, proxy, webhooks, workers e segredos |
| 9 | Implantar na VPS em etapa própria | CRM e página publicados com configuração Linux validada e jornadas repetidas no endereço final |

O visual não substitui os critérios comerciais e operacionais. A implantação
permanece para depois das validações locais, como o proprietário determinou.

## 13. Estado do trabalho e preservação

As mudanças estão no checkout local, com alterações acumuladas e arquivos novos.
Parte do conteúdo modificado já existia antes desta rodada; a lista inteira do
Git não deve ser atribuída ao tema ou a uma única intervenção. É necessária uma
revisão consolidada antes de montar a versão de implantação.

- Não houve atualização upstream após o cancelamento.
- Não houve publicação desta entrega em produção.
- Não foram apagados usuários, organizações ou os dados originais para recuperar acesso.
- Pagamentos de homologação ficaram no Sandbox; cancelamento atingiu somente
  assinatura fictícia identificada para o ensaio.
- A última rodada visual não alterou checkout, credenciais, schema ou regras financeiras.
- Chaves, senhas e conteúdo sensível de cobranças não são incluídos neste relatório.

## 14. Fontes de comprovação

- Plano inicial: `docs/plans/2026-10-15-chatai-online-produto.md`.
- Implementação comercial: `docs/plans/2026-10-16-planos-implementacao.md`.
- Homologação: `docs/plans/2026-10-17-checkout-homologacao.md` e
  `docs/plans/2026-10-17-homologacao-cartao-pix.md`.
- OpenAI: `docs/plans/2026-10-19-openai-validacao-local.md` e
  `docs/plans/2026-10-19-openai-conexao-local.md`.
- Provas financeiras: `evidence/planos-chatai-online/webhook-automatico-sandbox.json`
  e `evidence/planos-chatai-online/cartao-pix-sandbox-2026-10-17.json`.
- Provas de IA: `evidence/planos-chatai-online/openai-motor-real-2026-10-19.json`
  e `evidence/planos-chatai-online/openai-modalidades-reais-2026-10-17.json`.
- Tema: `docs/design/tema-violeta.md` e
  `evidence/tema-violeta-2026-10-20/agentes-escuro.jpg`.

Documentos antigos conservam fotografias de etapas anteriores. Este relatório
atualiza a cronologia sem transformar pendências antigas em conclusões não medidas.
