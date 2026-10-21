# Preparação da OpenAI no CRM local

> Registro histórico da preparação. A chave foi posteriormente cadastrada e
> validada, e o motor real foi testado em 19/10. Consulte os
> [resultados e pendências atuais](./2026-10-19-openai-validacao-local.md).

Data: 17/10/2026, America/Sao_Paulo. Checkout examinado: `D:/Antigravity/DeskcommCRM`, HEAD `856dec731` com as personalizações locais existentes. A atualização de repositório foi cancelada; este documento se refere ao checkout principal atual.

## Escopo e resultado

Preparação por leitura de código, metadados do Supabase e uma verificação de formato da chave de criptografia pelo carregador normal do Next.js, seguida de correções focais da rota e do formulário de credenciais, testes unitários e abertura do formulário no navegador local. Nenhuma chave OpenAI foi cadastrada ou testada. Não houve chamada paga, migração, publicação, alteração de credenciais ou mudança de modelo nesta etapa.

**A incompatibilidade de leitura de credenciais foi corrigida no código local e coberta por regressões.** O banco remoto não possui `base_url` na tabela de credenciais nem na view segura. A rota agora lista e confirma o cadastro de provedores nativos usando somente as colunas seguras disponíveis. A geração real OpenAI e a jornada de cadastro pela tela continuam pendentes.

## Evidência obtida

### Supabase pela integração

Projeto: `chataionline`, referência `nyyercvnkrldbngnipiu`. Foram consultados somente `information_schema.columns` e metadados de `pg_catalog.pg_class`; nenhuma linha de credencial, chave cifrada ou orçamento de cliente foi lida.

| Objeto                         | Resultado confirmado                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_provider_credentials_safe` | View presente, com `security_invoker=true`. Colunas: `id`, `organization_id`, `provider`, `label`, `api_key_last4`, `validated_at`, `validation_error`, `models_available`, `is_active`, `created_by`, `created_at`, `updated_at`. Não contém `base_url`.                                               |
| `ai_provider_credentials`      | A coluna `base_url` não existe. Não foram selecionados valores desta tabela.                                                                                                                                                                                                                            |
| `ai_budgets`                   | Tabela presente, RLS habilitada. Possui `organization_id`, `monthly_limit_cents`, `action_at_100pct`, `alarm_threshold_pct`, `current_month_consumed_cents`, `current_period_start`, `last_alarm_sent_at`, `is_throttled`, `is_disabled`, `updated_at`, `enforcement_mode`, `enforcement_effective_at`. |

### Criptografia local

A verificação usou `loadEnvConfig` de `@next/env`, resolvido pela dependência do próprio Next.js. A saída foi limitada aos seguintes booleanos:

| Verificação                        | Resultado |
| ---------------------------------- | --------- |
| Carregador de runtime disponível   | `true`    |
| `AI_CRED_AES_KEY` presente         | `true`    |
| Base64 bem formado                 | `true`    |
| Conteúdo decodificado com 32 bytes | `true`    |

O valor não foi impresso, copiado ou alterado. Isso prova formato e presença; **não prova** que a chave corresponde à usada para cifrar cada credencial já existente no Supabase compartilhado. Não gerar outra chave AES para tentar corrigir o cadastro: as credenciais existentes dependem dela.

## Correção mínima implementada

Arquivo: `app/api/v1/ai/credentials/route.ts`.

1. `base_url` foi retirada de `SAFE_COLUMNS`, a projeção segura usada por GET e pela resposta de POST, permitindo ler o contrato legado existente.
2. A página SSR `app/app/ai/credentials/page.tsx`, o PATCH em `app/api/v1/ai/credentials/[id]/route.ts` e o tipo `CredentialRow` de `hooks/ai/useCredentials.ts` já usam as colunas legadas sem `base_url`. A interface de listagem e rotação não consome esse endereço.
3. Não é necessário inventar um endereço canônico na linha retornada: o provedor nativo `openai` tem seu endpoint definido no validador e no runtime.
4. Preservar a exigência de endereço para `provider=custom`. O cadastro personalizado grava `base_url` por `lib/ai/credenciais/guardar.ts`; neste schema antigo ele não pode ser concluído. Deve permanecer uma falha explícita, sem descartar o endereço, escolher outra URL ou cair na OpenAI. Não fazer migração nesta etapa.
5. O POST verifica erro e ausência de linha na confirmação pela view segura, além de filtrar explicitamente `organization_id`. Se a confirmação falha, responde `503/internal_error` e orienta que a credencial pode ter sido salva: conferir a lista antes de tentar cadastrar novamente. Não repete a gravação nem devolve o erro interno do banco.

A incompatibilidade foi demonstrada por metadados e reproduzida com um dublê que recusa colunas ausentes; o fluxo HTTP com chave real ainda não foi executado.

### Formulário e preenchimento automático

Na conta antiga autenticada, a tela de credenciais e o diálogo de cadastro foram abertos no CRM local. Ao selecionar OpenAI, o navegador preencheu o campo **Nome** com o identificador do login e o campo protegido **Chave** ficou não vazio. Os campos foram limpos sem clicar em **Salvar e validar**. Nenhum valor preenchido foi exibido, enviado ao provedor ou cadastrado.

A correção em `app/app/ai/credentials/_components/AddCredentialDialog.tsx` declara `autoComplete="off"` no nome opcional e `autoComplete="new-password"` na chave, mantendo `type="password"`, o estado inicial vazio e o envio explícito pelo botão. Esses atributos orientam o navegador a não reutilizar o login como uma chave de API; um gerenciador de senhas pode adotar suas próprias regras. Cores, classes, layout e demais funções foram preservados.

A captura de preparação do formulário é uma evidência local não publicada, por privacidade. Após a correção, a reabertura real no navegador confirmou os campos Nome e Chave vazios. O campo protegido manteve `type="password"` e `autocomplete="new-password"`. Em seguida, foram preparados somente o provedor OpenAI e o nome opcional; nenhum cadastro, validação ou geração OpenAI foi executado pelo agente. O usuário informou que fará a digitação privada da chave.

Nos dois casos novos de `AddCredentialDialog.test.tsx`, a execução anterior ao fix apresentou uma falha prevista no atributo ausente de **Nome** e um controle aprovado: preencher o formulário não chama a API automaticamente. Após a correção, passaram os oito casos do componente e os onze casos das duas suítes da rota de credenciais: **19 testes em três arquivos**. A execução focal usa o setup unitário de planos, com `envDir=false`, valores fictícios e rede real bloqueada; não usa arquivos de ambiente. Uma configuração temporária selecionou esses três arquivos e foi removida após a execução.

ESLint dos dois arquivos TSX, Prettier dos quatro arquivos deste ajuste e `git diff --check` focal passaram. Depois da etapa focal, o typecheck canônico terminou com código zero e a suíte comercial completa passou: **609 testes em 47 arquivos**. A reabertura real do formulário foi conferida separadamente pelo navegador; a geração OpenAI continua pendente do cadastro e validação privados pelo usuário.

Destino: núcleo, pois todo cadastro de chave usa o mesmo formulário existente. Entrada: **IA → Credenciais → Adicionar credencial**; saída: POST existente de credenciais somente após o envio. O formulário continua exibindo erros e permitindo correção; o cadastro mantém sua auditoria existente. Não há rota, tabela, tela ou fluxo de envio novo.

### Cobertura existente e regressão necessária

- `tests/unit/credenciais-aceita-a-chave-do-jev.test.ts`: invoca POST, mas o dublê de `select` não confere colunas; não detectaria a regressão de schema.
- `tests/unit/credenciais-ia-rotacao.test.ts`: cobre criptografia, atualização no mesmo ID e ausência de chave na resposta.
- `app/app/ai/credentials/_components/AddCredentialDialog.test.tsx`: comportamento do formulário.
- `lib/ai/provider-validators.test.ts`: validação de provedores.
- `tests/unit/provedor-personalizado.test.ts`: recusa de personalizado sem endereço.
- `lib/agent-engine/edge/llm/credentials.test.ts`: resolução de credenciais do motor.

Regressões adicionadas em `tests/unit/credenciais-ia-view-legada.test.ts`: nove casos cobrindo GET/POST OpenAI contra uma view sem `base_url`, projeção segura, filtro de organização, confirmação com erro ou zero linhas e ausência de retry; manutenção da recusa para personalizado sem endereço, recusa de endereço injetado em OpenAI e falha de persistência sem fallback.

Antes da correção, a execução focal ficou vermelha nos cinco casos previstos e verde nos outros quatro. Depois da correção, os nove casos passaram. A execução focal incluiu também os dois casos existentes de `credenciais-aceita-a-chave-do-jev.test.ts`: **11 testes passaram em dois arquivos**. ESLint dos dois arquivos de código e a formatação dos quatro arquivos alterados passaram; `git diff --check` focal ficou limpo. A verificação geral posterior está registrada acima.

O teste novo usa somente dublês, proíbe rede e foi executado com configuração temporária sem o setup que carrega arquivos de ambiente. Isso comprova o comportamento da rota nos cenários unitários; não comprova autenticação, saldo ou geração na OpenAI.

## Roteiro pela interface existente

### 1. Cadastrar a credencial

Endereço: `http://127.0.0.1:3000/app/ai/credentials` — menu **IA → Credenciais**.

Com a correção local aplicada, um administrador usa **Adicionar credencial**, seleciona **OpenAI**, fornece um nome opcional e cola a chave no campo protegido. **Salvar e validar** cifra a chave com AES-256-GCM e valida em segundo plano. A leitura posterior vem da view segura; somente os quatro últimos caracteres são apresentados.

O validador usa `GET https://api.openai.com/v1/models`, com chave no cabeçalho e prazo de cinco segundos. Confirmar o estado **Validada** e a lista de modelos, inclusive após atualizar a página. Listar modelos prova autenticação e acesso à listagem; não prova saldo, permissão de geração nem resposta de agente.

O usuário fará o cadastro privado diretamente nesse campo; a validação aguarda seu retorno. Não precisa enviar a chave na conversa. Não configurar uma chave global de fallback para todas as organizações durante a ausência do usuário.

### 2. Configurar o modelo

Endereço: `http://127.0.0.1:3000/app/ai/providers` — **IA → Provedores**.

O card **Modelo padrão** grava o par provedor/modelo em `organizations.settings.llm`, preservando as demais configurações da organização. O modelo escolhido precisa existir no catálogo, estar disponível à chave e suportar as ferramentas necessárias. Não selecionar o modelo desta conversa automaticamente como modelo do produto.

Agentes publicados guardam provedor, modelo e credencial na própria versão. Trocar o padrão da organização não reconfigura todas essas versões. Para um agente específico, editar o rascunho em **IA → Agentes**, escolher OpenAI, a credencial validada e o modelo correto, preservando canal, funis, fontes e capacidades existentes.

Como o Supabase é compartilhado com a instalação existente, mudanças de credencial e configuração da mesma organização são compartilhadas. Preferir uma organização isolada para o ensaio; não tratar configurações gravadas no banco como exclusivas do processo local.

### 3. Conhecimento, áudio e visão

- A base de conhecimento reconhece uma credencial OpenAI ativa e validada da organização. A precedência está em `lib/ai/embeddings/chave.ts`.
- O contrato de embedding atual é `text-embedding-3-small`, 1536 dimensões. Não mudar o modelo ou a dimensão sem reindexação coordenada; isso não faz parte desta preparação.
- O worker de mídia procura uma chave OpenAI para áudio mesmo quando o chat usa outro provedor. O padrão de transcrição é `whisper-1`, salvo configuração já existente da instalação.
- Para analisar imagem, conferir a capacidade de visão do modelo selecionado. Não supor que qualquer modelo de texto atende esse caso.

### 4. Testar em rascunho

O botão **Testar** de um agente usa `app/api/v1/ai/agents/[id]/versions/[vid]/test/route.ts` e o motor real de prévia (`lib/agent-engine/agent/sandbox.ts`). Não envia WhatsApp nem cria contatos ou conversas reais; a geração OpenAI, quando habilitada, ainda consome API paga.

Roteiro proposto após cadastrar a chave: pergunta sobre uma FAQ conhecida; intenção de compra; pedido de horário para agendamento; pedido de atendimento humano; informação que não existe no material. Verificar texto, propostas de ferramentas e impedimentos. Quando houver ferramenta, confrontar a prévia e a ferramenta direta com o mesmo texto cru e dados de teste isolados, conforme `docs/doctrine/prova-em-par.md`.

Confirmar que a execução encerrou e que Uso/Execuções mostram resultado e custo, sem publicar uma versão ou enviar mensagens reais automaticamente. Nenhuma dessas jornadas foi executada nesta preparação.

## Custos e relação com os planos

Endereço: `http://127.0.0.1:3000/app/ai/usage` — **IA → Uso e orçamento**.

- Assinatura comercial Asaas, gasto OpenAI e limite do aplicativo são conceitos separados. Não inventar crédito de IA incluído nos planos aprovados.
- A interface atual usa chave do próprio cliente. Uma chave central da plataforma precisa de uma decisão comercial de consumo e isolamento; não foi ativada.
- O orçamento efetivo vem de `ai_budgets`. O campo legado `organizations.ai_budget_cents`, inclusive o zero criado no checkout, não é o controle usado pelo runtime atual.
- Os limites e custos do aplicativo são em centavos de dólar. Sem linha de orçamento, o padrão é acompanhar sem bloqueio. Não armar nem alterar um teto durante a ausência do usuário.
- `lib/agent-engine/edge/llm/pricing.ts` tem preços versionados para GPT-4o e modelos 5.x. Não há entrada GPT-6 no arquivo atual. Modelo sem preço conhecido produz custo `null` e pode subcontar o limite; não prometer proteção de gasto para um modelo ainda não coberto.
- A disponibilidade e o preço do modelo escolhido devem ser conferidos na documentação oficial antes do primeiro ensaio pago. O painel do fornecedor continua sendo a referência do gasto cobrado.

## Pendências para concluir

1. Provar o cadastro corrigido pela tela, sem alterar o schema; a regressão da rota já passou.
2. Usuário cadastrar uma chave OpenAI privada diretamente na interface.
3. Confirmar autenticação, permissão de geração e disponibilidade do modelo.
4. Executar a prévia do agente e conferir ferramentas, resposta e custos.
5. Validar áudio/conhecimento/visão somente nas capacidades que serão usadas.

## Fontes

- Código local: `lib/crypto/aes_gcm.ts`, `lib/ai/credenciais/guardar.ts`, `lib/ai/provider-validators.ts`, `lib/agent-engine/edge/llm/credentials.ts`, `lib/ai/embeddings/chave.ts`, `workers/media-derive-worker.ts`, `components/ai/BudgetCard.tsx` e rotas/telas citadas acima.
- [OpenAI — preparação para produção e proteção de chaves](https://developers.openai.com/api/docs/guides/production-best-practices).
- [OpenAI — permissões de projeto e de chaves](https://developers.openai.com/api/docs/guides/rbac).
- [Supabase — tabelas e views](https://supabase.com/docs/guides/database/tables#views) e [changelog](https://supabase.com/changelog), consultados nesta preparação. A depreciação anunciada de cifras TLS antigas não exige uma alteração deste documento ou do fluxo de credenciais.
