# Auditoria do construtor de chatbot — os 60 cards do "prompt master"

**Data:** 03/11/2026 · **Branch:** `chataionline/planos-por-recurso` · **Quem mediu:** sessão Claude (Opus 5.5)

Régua: cada card foi conferido no CÓDIGO — configuração (`lib/chatbot/passos.ts`),
validação (`lib/chatbot/validar.ts`), execução pura (`lib/chatbot/motor.ts`), efeito
real (`lib/chatbot/executar.ts`), painel (`app/app/ai/chatbots/[id]/_components/NodePanel.tsx`)
e teste. Card que só aparece na tela não conta como funcional.

Status usados: **F** funcional · **P** parcial · **T** só na tela · **N** não implementado ·
**E** implementado com erro · **NA** não se aplica ao canal/arquitetura · **B** bloqueado por
dependência externa.

O chatbot do produto tem **54 passos** hoje. Um card do prompt pode ser atendido por um passo
mais geral (ex.: "Perguntar e-mail" = "Pedir para digitar" com formato e-mail) — o prompt pede
para não duplicar implementação, e foi isso que se seguiu.

## Como o motor funciona (o que vale para todos os cards)

- **Sem IA:** nenhum passo chama modelo de IA. Só "Transferir p/ agentes de IA" entrega a
  conversa ao agente que já existe, que gasta IA no orçamento dele.
- **Estado persistido:** `chatbot_sessions` (passo atual, tentativas, respostas, `retomar_em`).
  Espera e retomada usam o `event_log` (relógio persistente), nunca timer em memória.
- **Idempotência:** uma sessão por (organização, conversa, fluxo); cada turno é ancorado na
  mensagem recebida; reenvio do mesmo evento não repete efeito.
- **Laço:** teto de passos por mensagem e de "Acionar outro fluxo" por turno.
- **Multiempresa:** toda leitura/escrita filtra `organization_id` (service role com filtro
  manual); invariantes de RLS no CI.
- **Versões:** **não há versão publicada imutável** — editar um fluxo ligado vale na hora para as
  conversas em andamento (passo apagado encerra a sessão sem erro). Ver pendência V1.

## Os 60 cards

| # | Card | Status antes | Status agora | Onde (passo do produto) | Teste | Limitação / dependência |
|---|---|---|---|---|---|---|
| 01 | Enviar texto | F | F | Enviar mensagem | motor.test | — |
| 02 | Enviar imagem | F | F | Enviar mídia (imagem) | executor + invariante | até 16 MB |
| 03 | Enviar áudio | P | F | Enviar mídia (áudio) | executor | prévia de áudio no painel entrou hoje; nota de voz convertida de webm |
| 04 | Enviar vídeo | F | F | Enviar mídia (vídeo) | executor | até 16 MB |
| 05 | Enviar arquivo/PDF | F | F | Enviar mídia (documento) | executor | — |
| 06 | Enviar link | P | P | Enviar mensagem com o link | — | não há card próprio que valide o protocolo da URL |
| 07 | Enviar localização | N | F | Enviar localização (novo) | cards-fase-4.test | sai como mensagem com endereço e link do mapa; o pino nativo não (o envio do CRM não fala esse formato) |
| 08 | Enviar contato | N | F | Enviar contato (novo) — o cartão da Inbox | cards-fase-4 (unit + invariante) | — |
| 09 | Botões de resposta | N | F (API oficial) / NA (QR Code) | Pedir para escolher | escolhas-interativas.test | até 3 opções ≤20 letras; QR Code não exibe botão (o WhatsApp não mostra) |
| 10 | Menu de opções | F | F | Pedir para escolher (lista na API oficial) | motor.test | até 10 opções ≤24 letras viram lista |
| 11 | Carrossel de produtos | N | B | — | — | QR Code não tem; na API oficial exige catálogo da Meta |
| 12 | Mensagem personalizada | F | F | variáveis `{{x}}` em qualquer texto | motor.test | variável vazia vira vazio; não há valor padrão |
| 13 | Link de pagamento | N | P | Enviar link de pagamento (novo) | enviar-pagamento.test | manda o link do vendedor; **gerar** o link depende de ligar o provedor de pagamento da empresa (B) |
| 14 | Enviar Pix | N | P | Enviar link de pagamento (Pix copia e cola) | enviar-pagamento.test | QR Code do Pix: subir a imagem num Enviar mídia |
| 15 | Enviar boleto | N | P | Enviar link de pagamento (link do boleto) | — | sem geração de boleto (B) |
| 16 | Catálogo de produtos | N | F | Enviar produto (novo): lido no Catálogo na hora, com a primeira foto | cards-fase-4 (unit + invariante) | um produto por card; desativado não sai e vira nota |
| 17 | Oferta/promoção | P | P | Enviar mensagem / mídia | — | sem validade nem regra comercial |
| 18 | Cupom de desconto | N | B | — | — | o CRM não tem módulo de cupom |
| 19 | Status do pagamento | N | P | aviso da plataforma de venda (Kiwify, Cakto, Hotmart nova) → automação → chatbot | plataformas-de-venda.test | a plataforma avisa; consulta ativa ao provedor não existe |
| 20 | Confirmar compra | P | F | aviso da plataforma (compra aprovada) move o negócio e pode iniciar chatbot | plataformas-de-venda.test | Kiwify, Cakto e Hotmart; outras pelo mapeador genérico |
| 21 | Perguntar nome | F | F | Pedir para digitar + Campo do contato, ou Enviar formulário (gravar no nome) | regras.test | — |
| 22 | Perguntar telefone | P | F | Pedir para digitar (formato telefone, novo) | pedir-digitar-formato.test | 8 a 15 dígitos |
| 23 | Perguntar e-mail | P | F | Pedir para digitar (formato e-mail, novo) | pedir-digitar-formato.test | não confere se a caixa existe |
| 24 | Pergunta personalizada | F | F | Pedir para digitar | motor.test | — |
| 25 | Múltipla escolha | F | F | Pedir para escolher | motor.test | — |
| 26 | Data e horário | P | P | Pedir para digitar (formato data) | pedir-digitar-formato.test | horário avulso não; data em dd/mm/aaaa |
| 27 | Salvar em variável | F | P | respostas do fluxo + Campo do contato | regras.test | sem tipo declarado nem escopo "conversa" |
| 28 | Condição SE/SENÃO | F | F | Definir condição | regras.test | — |
| 29 | Verificar resposta | F | F | Definir condição / Valor | regras.test | — |
| 30 | Verificar palavra-chave | F | F | Mensagem contém | motor.test | normaliza acento e maiúscula |
| 31 | Verificar variável | F | F | Valor | passos-umbler-fase-2.test | números e datas comparam como tal |
| 32 | Verificar tag | F | F | Etiquetas | condicoes.test | — |
| 33 | Etapa do funil | N | F | Etapa do funil (novo) | cards-fase-4 (unit + invariante) | só negócio aberto conta |
| 34 | Dividir caminhos | F | F | Multi-condicional / Distribuir fluxo | motor.test | — |
| 35 | Redirecionar fluxo | F | F | Acionar outro fluxo | invariante | leva as respostas; sem "voltar"; teto contra laço |
| 36 | Aguardar tempo | F | F | Aguardar intervalo / Aguardar até | espera-e-avaliacao.test | relógio persistente |
| 37 | Aguardar resposta | P | F | Pedir para escolher / digitar com "Se o contato não responder" (novo) | prazo-da-resposta (unit + invariante) | até 7 dias; relógio persistente |
| 38 | Cliente parou de responder | N | F | saída "Não respondeu a tempo" das perguntas (novo) | chatbot-prazo-da-resposta (invariante) | silêncio de dias continua na automação "N dias sem mensagem" |
| 39 | Follow-up automático | F | F | Iniciar follow-up (módulo existente) | invariantes do follow-up | janela, opt-out e modelo aprovado ficam no módulo |
| 40 | Reativar conversa | P | P | Enviar template + follow-up | — | fora da janela só modelo aprovado (API oficial) |
| 41 | Agendar envio | P | P | Aguardar até + Enviar mensagem | — | — |
| 42 | Horário comercial | P | P | Horários + Dias da semana | motor.test | sem feriados |
| 43 | Consultar horários | F | F | Agendar horário (Agenda do CRM) | invariante da agenda | — |
| 44 | Enviar opções de horário | F | F | Agendar horário (lista clicável na API oficial, nova) | motor.test | — |
| 45 | Criar agendamento | F | F | Agendar horário | invariante | horário tomado no meio segue por "Sem horário livre" |
| 46 | Confirmar agendamento | F | F | Agendar horário → `{{horario}}` numa mensagem | motor.test | — |
| 47 | Reagendar | N | F | Reagendar horário (novo) — mesmo caminho do Agendar, muda o compromisso pelo handler da Agenda | cards-fase-4.test | o alvo é o próximo compromisso do contato |
| 48 | Cancelar agendamento | N | F | Cancelar agendamento (novo) — handler da Agenda | cards-fase-4.test | o alvo é o próximo compromisso do contato |
| 49 | Criar lead | F | F | Negócio no funil (cria se não houver aberto) | invariante | — |
| 50 | Atualizar dados | F | F | Campo do contato | regras.test | nome, e-mail, aniversário, campo personalizado |
| 51 | Adicionar/remover tag | F | F | Editar etiquetas + etiqueta de origem (nova) | etiqueta-de-origem.test | — |
| 52 | Mover no funil | F | F | Negócio no funil | invariante | — |
| 53 | Atribuir vendedor | P | F | Transferir p/ atendente: fixo, rodízio, menos conversas, quem atendeu antes (novo) | transferir-atendente-modos (unit + invariante) | rodízio só entre quem está disponível |
| 54 | Transferir para humano | F | F | Transferir para a equipe / setor / atendente | invariantes | IA calada até a pessoa devolver |
| 55 | Notificar vendedor/equipe | F | F | Notificar atendente | executor | Central de avisos + push |
| 56 | Iniciar fluxo | F | F | Iniciar por canal / automação / manual | motor.test | — |
| 57 | Encerrar fluxo | F | F | Finalizar conversa | motor.test | — |
| 58 | Chamar agente de IA | F | F | Transferir p/ agentes de IA | invariante fase 2 | sem volta automática ao fluxo |
| 59 | Enviar webhook | F | F | WebHook | webhook.test | anti-SSRF em 2 camadas, HMAC, 8 s, 1 tentativa; sem cabeçalho livre |
| 60 | Consultar API externa | F | F | WebHook (GET + campos da resposta → variáveis) | webhook.test | idem |

## Editor (etapa 4)

| Recurso | Status | Observação |
|---|---|---|
| Arrastar, conectar, painel lateral, zoom, mover | F | React Flow |
| Duplicar, excluir, desfazer/refazer, organizar | F | entrou hoje com a barra no estilo Umbler |
| Copiar e colar | F | Ctrl+C / Ctrl+V, inclusive entre fluxos; o segredo do WebHook não viaja (`area-de-transferencia.test`) |
| Salvar automático | F | com o fluxo desligado, 2 s depois da última mudança; ligado, o salvar continua no botão (o desenho pela metade não responde cliente) |
| Publicar versões / restaurar | N | ver pendência V1 |
| Validar antes de ligar | F | a rota recusa ligar com problemas (`problemasDoGrafo`) |
| Conexões inválidas e cards incompletos | F | `validar.ts` |
| Caminhos de erro/timeout | F | saídas nomeadas por passo |
| Biblioteca em 8 categorias | P | hoje 4 grupos (Início, Condições, Ações, Finalização) + integrações |

## Pendências (o que falta, por quê, próxima ação)

- **A1 — Prazo de resposta nas perguntas** (cards 37/38): feito. Falta estender ao Enviar formulário e ao Agendar horário.
- **V1 — Versões publicadas imutáveis:** pede tabela de versões (migration nova, não destrutiva) e decisão de produto (publicar ≠ salvar). Próxima ação: desenhar e aprovar.
- **Cards 07, 08, 16, 33, 47, 48:** feitos, reaproveitando o que já existia (cartão de contato da Inbox, Catálogo, funil, handlers da Agenda).
- **B (bloqueados):** 11, 18, 19 e a geração de link/boleto (13, 15) — dependem de conta de pagamento da empresa ligada ao CRM ou de recurso que o canal não oferece.
- **Modelos prontos:** 19 (os 18 do prompt, com "captura de leads" atendida por "Coletar dados" e "transferência para IA" pela "Triagem com o agente de IA").
- **Pré-existente, fora do chatbot:** `pnpm lint:channels` reprova `lib/exportacao/exclusao.ts` e `lib/instalacao/disparo-em-massa.ts`, e o `eslint` reprova `app/api/v1/webhooks/waha/[token]/route.ts` (um `any`) — os três vieram do commit de 21/10 do fork, não desta entrega.
