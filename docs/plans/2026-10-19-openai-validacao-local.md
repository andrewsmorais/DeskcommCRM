# OpenAI no CRM local — evidências e limites da validação

Data da consolidação: 19/10/2026. Este relatório reúne medições de 17 e 19/10,
sem substituir os arquivos de evidência nem transformar testes de componentes
em comprovação de atendimento completo.

## Conclusão medida

O motor real do CRM conseguiu usar a credencial OpenAI da organização, gerar uma
resposta de texto e executar uma ferramenta sintética em memória. Foram três
requisições reais à API OpenAI, todas com HTTP 200. As duas chamadas do motor
registraram modelo, tokens e estimativa de custo no banco, com os totais de
tokens conferidos contra as respostas recebidas.

**O atendimento completo ainda não está homologado.** Em 19/10 não foi possível
concluir a prova pela tela: a ferramenta de navegador recusou a URL local por sua
política de acesso. Não houve contorno dessa restrição. Na conferência registrada
havia zero versões de agente salvas, e nenhum canal WhatsApp conectado para esta
validação. O formulário aberto não equivale a um agente publicado.

## Configuração e autorização

O [registro da conexão local](./2026-10-19-openai-conexao-local.md) documenta a
consulta ao projeto `chataionline`, a aplicação da migration existente
`0463_proposta_ai_draft_enabled` e a criação da conexão técnica do servidor.

- A credencial preservada é **OpenAI ChatAI Online**, validada. O padrão da
  organização foi configurado pela tela em 17/10 como **OpenAI / GPT-5.4 Nano**.
- A primeira tentativa de criar a conexão técnica foi recusada pela revisão
  automática de aprovação devido ao alcance de `service_role`. A conexão só foi
  criada depois da autorização explícita do proprietário para esse alcance.
- O login técnico pode assumir `service_role`. **Nesse estado ele ignora RLS**;
  seu acesso não está restrito a uma única organização pelo banco. Os filtros de
  organização do servidor continuam sendo obrigatórios. O teste negativo abaixo
  não transforma esse acesso privilegiado em isolamento completo comprovado.
- A conexão usa TLS com verificação de certificado e hostname e CA oficial do
  Supabase. Os valores secretos não fazem parte destes documentos ou evidências.
- A senha original do banco não foi redefinida. A tentativa com a senha
  candidata falhou com `28P01`; não houve novas tentativas de adivinhação.
- Não houve atualização do repositório original, redesenho da interface ou
  publicação na VPS nesta etapa.

## Motor real — 19/10

Fonte: [openai-motor-real-2026-10-19.json](../../evidence/planos-chatai-online/openai-motor-real-2026-10-19.json).
O caminho exercitado foi `runModelCall`, com banco real e a credencial salva da
organização. Os conteúdos eram sintéticos, sem contato ou agente associado.

| Caso | Resultado medido | Alcance da prova |
|---|---|---|
| Texto simples | `CONEXAO_OPENAI_OK`; 43 tokens de entrada e 10 de saída; uma etapa | Geração real pelo dispatcher e persistência em `llm_calls` |
| Ferramenta em memória | `HORARIO_TESTE_OK 15:30`; uma execução de ferramenta, duas etapas, 294 tokens de entrada e 34 de saída | O modelo chama uma ferramenta e utiliza seu retorno; não executa uma ferramenta de agenda do CRM |
| Credencial de outra organização | Recusa `wrong_org`, sem chamada ao provedor | O resolvedor de credenciais recusa esse caso específico antes de usar a chave |

As duas chamadas bem-sucedidas registraram `status=ok`,
`origem_da_escolha=padrao_da_organizacao`, provedor `openai` e modelo
`gpt-5.4-nano`. A soma dos tokens das etapas coincidiu com o consumo persistido,
inclusive no caso com ferramenta. Os custos estimados pelo CRM foram
respectivamente **0,00211** e **0,01013 centavos de dólar**, total de **0,01224
centavos de dólar**. Esses valores são a estimativa registrada pelo aplicativo;
não constituem reconciliação da fatura da OpenAI.

As três requisições HTTP foram a `api.openai.com/v1/responses`. Seus identificadores
e os IDs dos registros locais estão no JSON, permitindo correlacionar as
medições sem armazenar a chave.

O orçamento da organização estava em modo `off`. Sua leitura funcionou, mas
**não foi exercitada a recusa por limite mensal** com a conexão real. A resposta
da ferramenta de horário era fixa e mantida em memória: não consultou
disponibilidade real, não criou agendamento e não enviou mensagem a cliente.

## Modalidades — 17/10

Fonte: [openai-modalidades-reais-2026-10-17.json](../../evidence/planos-chatai-online/openai-modalidades-reais-2026-10-17.json).

| Modalidade | Resultado | Limite |
|---|---|---|
| Embedding | `embedText` com `text-embedding-3-small`: 1536 dimensões, 9 tokens, chave da organização | Valida o helper; não comprova indexação e recuperação completas de uma base de conhecimento pela tela |
| Transcrição | `apiTranscriptionProvider` com `whisper-1` reproduziu exatamente a frase sintética de teste | Áudio gerado para o teste, sem mensagem recebida pelo WhatsApp |
| Visão inicial | `gpt-4.1-nano` respondeu “Verde” a uma imagem inteiramente vermelha de 64 × 64 pixels (imagem enviada: `evidence/planos-chatai-online/openai-imagem-sintetica-vermelha-64px.png`) | Falha semântica preservada na evidência |
| Contraprova de visão | `gpt-5.4-nano` respondeu “Vermelho” à imagem vermelha de 256 × 256 pixels (imagem enviada: `evidence/planos-chatai-online/openai-imagem-sintetica-vermelha-256px.png`) | Passaram a ser diferentes o modelo, o tamanho e a representação da imagem; não é comparação causal controlada |

O coletor reteve metadados HTTP e request IDs do embedding e da contraprova de
visão. Não reteve os request IDs da primeira visão e do áudio; as chamadas não
foram repetidas apenas para recuperar esses metadados.

O JSON de 17/10 registra a ausência da conexão PostgreSQL naquele momento. Essa
condição histórica foi superada para o motor de texto em 19/10, conforme a
evidência nova. Isso não amplia automaticamente a prova antiga de mídia para o
fluxo completo do agente ou para o canal WhatsApp.

## Regressões automatizadas

As contagens abaixo foram lidas dos respectivos JSONs, usando os elementos de
`testResults` para contar arquivos e `numPassedTests` para contar casos. São
execuções de uma seleção focal; não representam toda a suíte do repositório.

| Execução | Arquivos | Casos aprovados | Falhas | Evidência |
|---|---:|---:|---:|---|
| Configuração, 17/10 | 45 | 415 | 0 | [JSON de 17/10](../../evidence/planos-chatai-online/openai-regressoes-configuracao-2026-10-17.json) |
| Configuração, 19/10 | 44 | 414 | 0 | [JSON de 19/10](../../evidence/planos-chatai-online/openai-regressoes-configuracao-2026-10-19.json) |
| Complemento de rotação, 19/10 | 1 | 1 | 0 | [JSON do complemento](../../evidence/planos-chatai-online/openai-rotacao-complemento-2026-10-19.json) |

A diferença entre as listas é
`app/app/ai/credentials/_components/RotateCredentialDialog.test.tsx`, um caso
presente no resultado de 17/10 e ausente do resultado principal de 19/10. A
execução complementar aprovou esse caso. A união das duas execuções de 19/10
abrange **45 arquivos e 415 casos distintos**, sem falhas. Não se somam execuções
repetidas como casos distintos, e o resultado de 19/10 não é apresentado como uma
única execução unificada.

A configuração de regressões usa `vitest.openai.config.ts` sobre a configuração
isolada comercial, sem carregar arquivos de ambiente e com rede substituída por
dublês dos testes. Esses resultados cobrem credenciais, seleção de modelo,
orçamento, resolução de provedores, limites, tratamento de erros e componentes;
não são chamadas pagas à OpenAI.

Histórico dos reparos e provas antes/depois:

- [Regressões e confirmação de cadastro de credencial](./2026-10-17-openai-regressoes.md).
- [Informação factual no painel de provedores](./2026-10-17-provedores-informacao-factual.md).
- [Conexão local e erro específico na prévia](./2026-10-19-openai-conexao-local.md).

Em 19/10, o agente de verificação executou o typecheck canônico, concluído com
código zero, e ESLint dos 11 arquivos focais, também com código zero: nenhum
erro e um aviso preexistente de `set-state-in-effect` no painel de Provedores.
A verificação focal de whitespace do Git passou. Isso não equivale a um lint
global de todas as alterações preexistentes do checkout. O Prettier dos cinco
arquivos focais de pool/prévia/configuração passou; seis arquivos do
painel/embeddings já falhavam na formatação de HEAD, e esse débito antigo foi
preservado, corrigindo somente os trechos novos identificados.

## Interface e critérios ainda pendentes

A captura do painel em 17/10 (evidência local não publicada, por privacidade)
comprova a configuração visível daquela data. Em 19/10, a URL local de trabalho
era `http://127.0.0.1:3000/app/ai/agents/new`; a política da ferramenta de navegador
impediu a prova visual final. A chamada ao motor não comprova essa página.

### Inicialização local em 19/10

O modo Turbopack permaneceu compilando e não respondeu ao login em uma espera
de 120 segundos. O processo ainda consumia CPU, sem erro explícito; isso não
comprova deadlock ou um defeito específico do compilador. Foram reiniciados
somente os dois processos dessa execução local e usado `next dev --webpack`
em `127.0.0.1:3000`, sem mudar código, interface ou dados. Nesse modo, a
requisição pública a `http://127.0.0.1:3000/login` retornou **HTTP 200** em
31,705 segundos, incluindo a primeira compilação. O servidor ficou em execução.
Esta é uma prova de disponibilidade HTTP, não de login, sessão ou navegação
visual. A captura visual de 19/10 continua pendente pelo bloqueio da ferramenta.

Para encerrar a homologação conforme a Definition of Done ainda é necessário:

1. Salvar uma versão de agente pela tela, selecionar sua credencial e executar
   os cenários de atendimento na prévia real, com evidência visual.
2. Para cada ferramenta real usada pelo agente, medir também sua chamada direta
   com o mesmo texto cru, conforme a [prova em par](../doctrine/prova-em-par.md).
   A ferramenta sintética desta rodada não satisfaz o critério de agendamento.
3. Exercitar limites de orçamento reais, recusas e continuidade para atendimento
   humano sem usar clientes reais como dados de teste.
4. Validar isolamento entre organizações além do caso negativo de credencial.
   Não foi realizada nesta rodada a suíte de invariantes RLS em banco descartável
   nem uma auditoria completa de todos os caminhos com acesso privilegiado.
5. Quando houver um canal de teste conectado, medir recebimento, resposta e mídia
   pelo WhatsApp. Não há prova de entrega ao canal nesta rodada.
6. Preparar e validar separadamente a instalação na VPS. A conexão e o caminho
   da CA configurados no Windows não são prova de instalação Linux.

## Destino e continuidade

O tratamento de erros e a informação correta de modelos pertencem ao núcleo,
nos fluxos já existentes. A conexão técnica é infraestrutura desta instalação;
não é uma role global a distribuir no baseline dos demais clientes.

Entrada e saída continuam sendo IA → Agentes → Testar e o painel de resultado.
`ai_agent_runs` registra falhas da prévia; `llm_calls` registra as chamadas do
motor medidas nesta rodada. A orientação de conexão ausente permite corrigir e
repetir o teste, e a sanitização impede que URLs e segredos sejam mantidos no
erro. Não foi criada uma nova tela ou porta de navegação. O checklist detalhado
de continuidade está no registro da conexão local.

Este relatório e o ajuste de metadados do fragmento de release não executaram
testes, consultas ao banco, chamadas à OpenAI ou ações de navegador. Consolidam
os artefatos indicados acima e mantêm explícito o que falta medir.
