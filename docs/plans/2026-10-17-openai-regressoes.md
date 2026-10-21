# Regressões focais da integração OpenAI — 17/10/2026

## Resultado automatizado

Foram verificados **40 arquivos e 361 casos unitários**, todos aprovados também em uma execução final unificada, com saída 0 e duração de 294,83 segundos. A seleção cobre credenciais, validação de provedor, cifra e rotação, listagem segura, resolução de modelos, embeddings, orçamento, limite de chamadas, encaminhamento ao humano, seleção inicial de provedor e leituras permitidas no modo de teste do agente.

A execução usa `vitest.openai.config.ts`, que estende a configuração pura de `vitest.planos.config.ts` apenas para selecionar os arquivos de IA. Ela não carrega arquivos de ambiente, usa acessos Supabase fictícios e bloqueia chamadas reais de `fetch`. Cada teste que verifica HTTP instala seu próprio dublê. Nenhuma chave real foi lida, nenhuma chamada paga foi feita e nenhum dado Supabase foi alterado por esta verificação unitária.

Para repetir: `pnpm exec vitest run --config vitest.openai.config.ts`.

- Typecheck canônico: saída 0.
- ESLint dos quatro arquivos de código, teste e configuração tocados: saída 0.
- Verificação Git dos arquivos tocados: sem erro de espaços.
- O resultado final unificado está em `evidence/planos-chatai-online/openai-regressoes-final-2026-10-17.json`. O histórico do reparo e a consolidação estão em `openai-regressoes-2026-10-17.json`, `openai-regressoes-complemento-2026-10-17.json` e `openai-regressoes-resumo-2026-10-17.json`, na mesma pasta.

## Defeito comprovado e corrigido

O diálogo de inclusão exibia “Credencial salva. Validando…” **antes** da resposta de gravação. Isso podia ser entendido como confirmação mesmo quando o servidor recusava o cadastro.

O texto de espera passou a ser “Salvando credencial…”. A confirmação posterior permanece vinculada ao sucesso da resposta. O teste de regressão segura a resposta, verifica a ausência de confirmação antecipada e depois simula recusa: o erro aparece, os campos e o formulário são preservados, e os callbacks de sucesso e fechamento não são chamados.

Prova antes/depois: um caso vermelho e oito verdes antes; nove casos verdes após a alteração. Nenhuma classe, cor, layout ou componente visual foi substituído.

## Cobertura nova do validador OpenAI

Dez casos simulados verificam o endpoint autenticado `/v1/models`, chave somente no header Bearer, catálogo vazio, recusas 401/403, respostas 429/500/503, erro de rede, JSON inválido e interrupção após cinco segundos. A resposta de validação não repete a chave nem o corpo de erro do provedor.

Essa consulta de catálogo não comprova geração paga, saldo, acesso a todos os modelos ou funcionamento do agente publicado. A prova real pela interface é independente deste relatório.

## Reparo local de dependência, separado da correção de código

A primeira rodada teve 317 casos verdes, mas três arquivos não puderam ser coletados porque a pasta instalada de `pg@8.23.0` estava vazia. Foram restaurados somente 20 arquivos ausentes do tarball oficial do registro npm, após conferir o SHA512 fixado no lock. Nenhum arquivo existente foi sobrescrito.

O carregamento de `pg` passou, e os três arquivos foram executados novamente junto com as duas regressões novas: cinco arquivos e 53 casos aprovados. A consolidação substitui o resultado anterior de cada arquivo, sem somar casos repetidos. O registro do reparo está em `evidence/planos-chatai-online/pg-dependencia-restaurada-2026-10-17.json`.

Os hashes de `package.json` e `pnpm-lock.yaml` permaneceram idênticos. Não houve instalação geral, mudança de versão, atualização do repositório ou migration.

## Limites desta prova

Esta rodada não executa RLS em banco descartável, instalação fresca, canal WhatsApp, agenda externa, envio a contatos ou geração real OpenAI. O conjunto automatizado é focal; não representa a suíte inteira do repositório. O teste real com a chave cadastrada, a confirmação do modelo e o cenário de atendimento dependem da prova pela tela realizada separadamente.

## Living System Checklist — confirmação de cadastro

1. Entrada: envio do formulário em `AddCredentialDialog`.
2. Saída: POST existente em `/api/v1/ai/credentials` e atualização da lista de credenciais.
3. Registro: auditoria existente da rota de cadastro; nenhum novo efeito de dados nesta correção de texto.
4. Tela: toast de espera e erro no diálogo de credenciais.
5. Porta: IA → Credenciais, sem rota nova.
6. Anti-morte: recusa mantém o formulário e permite nova tentativa consciente.
7. Configuração: os campos existentes continuam visíveis e editáveis.
8. Continuidade: não modifica a relação entre atendimento humano e agente; trata apenas do cadastro administrativo da chave.
9. Retorno de erro: `showApiError` informa a recusa, e o diálogo não anuncia sucesso.
10. Mapa: nenhuma peça ou aresta nova; o fluxo já existente foi preservado.
