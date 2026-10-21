# OpenAI: conexão local e comprovação do motor

## Escopo e autorização

Continuação da homologação de 17/10/2026, sem atualizar o repositório original,
redesenhar a interface ou publicar na VPS. A autorização para migrations foi
concedida pelo proprietário. Em 19/10, após a explicação do alcance de
`service_role`, ele autorizou especificamente a conexão técnica do servidor.

A primeira tentativa de criar essa conexão foi rejeitada pela revisão
automática por falta de autorização explícita para o acesso amplo. Uma revisão
independente descartou liberar todo o runtime por uma role apenas com policies
adicionais: funções SECURITY DEFINER e helpers de identidade exigiriam trabalho
de isolamento e prova específicos. A operação só foi repetida após a nova
autorização informada.

## Estado confirmado

- Projeto consultado pela integração Supabase: `chataionline`.
- Existe uma única credencial de IA na organização: **OpenAI ChatAI Online**,
  provedor OpenAI, validada. Nenhum valor secreto foi incluído nesta evidência.
- Padrão da organização configurado pela tela em 17/10: OpenAI / GPT-5.4 Nano.
- Migration existente `0463_proposta_ai_draft_enabled` aplicada e conferida:
  coluna booleana, NOT NULL, default true. A tripla do schema já existe no repo.
- A senha de banco candidata não autenticou (`28P01`). A senha original não foi
  redefinida e não foram feitas novas tentativas de adivinhação.
- Criado o login técnico `chatai_local_ai_20261019`, limitado a quatro conexões,
  sem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ou BYPASSRLS próprios, e sem
  ADMIN OPTION. A membership permite SET ROLE service_role, sem herança
  automática. **Ao assumir service_role, a conexão ignora RLS e tem o alcance
  amplo de servidor explicitamente autorizado.**
- O verificador SCRAM foi enviado ao Supabase; a senha forte foi gerada em
  memória e guardada somente na configuração local ignorada pelo Git.
- Conexão real conferida: session_user técnico, current_user service_role,
  organização esperada encontrada. TLS usa `sslmode=verify-full` e a CA oficial
  do Supabase, validando certificado e hostname.
- Pool local limitado a três conexões; timeouts SQL e transação ociosa de 30 s.
  Nenhum privilégio de usuários do CRM foi modificado.

## Limites da prova

O teste de conexão é uma consulta somente de leitura. Não comprova sozinho
resposta do agente, uso das ferramentas, sessão de navegador ou entrega por
WhatsApp. Os resultados de chamadas reais ao motor ficam na evidência separada
`evidence/planos-chatai-online/openai-motor-real-2026-10-19.json` quando concluída.

Em 19/10 a ferramenta de navegador recusou adquirir a aba local por sua política
de URL. Não foi tentado acesso indireto, outra superfície de navegador ou leitura
de cookies. O usuário foi orientado a reabrir a página. A prova visual final fica
pendente até a ferramenta permitir acesso ou o usuário concluir o fluxo.

No momento dessa conferência havia zero versões de agente salvas na organização.
O único agente era o rascunho sintético arquivado do teste anterior, sem versão
publicada. O formulário de novo agente aberto ainda não é um agente operacional.

## Preparação para a VPS

Esta configuração é da máquina local. Não copiar cegamente a conexão local para
Linux: o caminho da CA é local ao Windows. Quando a publicação for autorizada,
provisionar uma conexão exclusiva da VPS, instalar a CA no servidor, configurar
os serviços pelo kit e verificar TLS, conectividade, migrations necessárias,
segredos, custos, isolamento e fluxo real antes de ativar canais de atendimento.
A publicação não foi executada nesta etapa.

## Destino e Sistema Vivo

Destino do tratamento de erro: núcleo, no fluxo existente de teste de agente.
Destino da conexão: infraestrutura específica desta instalação; não é uma role
global a inserir no baseline de todos os clientes.

1. Entrada: tela IA → Agentes → Testar, passando pela rota autenticada existente.
2. Saída: runtime de prévia e resultado exibido no painel de teste.
3. Registro: ai_agent_runs fecha como failed se a conexão falta; log sanitizado.
4. Visibilidade: erro da rota explica a configuração ausente; Execuções mantém o
   registro correspondente ao fluxo atual.
5. Porta: navegação existente de agentes, sem tela nova.
6. Próximo passo: corrigir conexão e repetir o teste; nenhum envio real é feito
   por essa prévia.
7. Configuração: SUPABASE_DB_URL já pertence ao contrato da instalação. A chave
   OpenAI continua no cadastro protegido de Credenciais.
8. Continuidade: handoff e atendimento permanecem no runtime existente; esta
   correção não altera decisões IA/humano.
9. Retorno: falha deixa orientação e registro, sem persistir segredo no erro.
10. Mapa: fluxo de prévia existente, nenhuma peça arquitetural nova adicionada.
