# Auditoria do construtor de chatbot — os 60 cards do "prompt master"

**Data:** 03/11/2026 · **Branch:** `chataionline/planos-por-recurso` · **Quem mediu:** sessão Claude (Opus 5.5)

Régua: cada card foi conferido no CÓDIGO — configuração (`lib/chatbot/passos.ts`),
validação (`lib/chatbot/validar.ts`), execução pura (`lib/chatbot/motor.ts`), efeito
real (`lib/chatbot/executar.ts`), painel (`app/app/ai/chatbots/[id]/_components/NodePanel.tsx`)
e teste. Card que só aparece na tela não conta como funcional.

Status usados: **F** funcional · **P** parcial · **T** só na tela · **N** não implementado ·
**E** implementado com erro · **NA** não se aplica ao canal/arquitetura · **B** bloqueado por
dependência externa.

O chatbot do produto tem **56 passos** em 03/11/2026 (o número muda; quem vale é a lista `PASSOS` de `lib/chatbot/passos.ts`). Um card do prompt pode ser atendido por um passo
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
| 06 | Enviar link | P | F | Enviar mensagem com o link — os links do texto são conferidos (`lib/chatbot/links.ts`) | feriados-horas-links-oferta.test | `javascript:`/`data:`/`file:` e link incompleto impedem ligar; `http://` só avisa; link que chega inteiro numa `{{variavel}}` não é conferido no desenho; não é filtro de golpe (https para site ruim passa) |
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
| 17 | Oferta/promoção | P | F | Enviar oferta (novo): texto + validade; vencida, nada sai e segue por "Oferta vencida" | feriados-horas-links-oferta.test | validade por dia, no fuso da empresa; sem regra comercial (preço, estoque, cupom — ver 18) |
| 18 | Cupom de desconto | N | B | — | — | o CRM não tem módulo de cupom |
| 19 | Status do pagamento | N | P | aviso da plataforma de venda (Kiwify, Cakto, Hotmart nova) → automação → chatbot | plataformas-de-venda.test | a plataforma avisa; consulta ativa ao provedor não existe |
| 20 | Confirmar compra | P | F | aviso da plataforma (compra aprovada) move o negócio e pode iniciar chatbot | plataformas-de-venda.test | Kiwify, Cakto e Hotmart; outras pelo mapeador genérico |
| 21 | Perguntar nome | F | F | Pedir para digitar + Campo do contato, ou Enviar formulário (gravar no nome) | regras.test | — |
| 22 | Perguntar telefone | P | F | Pedir para digitar (formato telefone, novo) | pedir-digitar-formato.test | 8 a 15 dígitos |
| 23 | Perguntar e-mail | P | F | Pedir para digitar (formato e-mail, novo) | pedir-digitar-formato.test | não confere se a caixa existe |
| 24 | Pergunta personalizada | F | F | Pedir para digitar | motor.test | — |
| 25 | Múltipla escolha | F | F | Pedir para escolher | motor.test | — |
| 26 | Data e horário | P | F | Pedir para digitar (formato data ou hora) e Enviar formulário (tipo hora) | pedir-digitar-formato.test, feriados-horas-links-oferta.test | data em dd/mm/aaaa; hora guardada em hh:mm (aceita 14, 14h, 14h30, às 14:30); não confere se o horário está livre — para isso, Agendar horário |
| 27 | Salvar em variável | F | F | Guardar em variável (novo) + respostas do fluxo + Campo do contato | aguardar-data-e-guardar-valor.test | sem tipo declarado: tudo é texto, e o Valor compara como número ou data quando dá; vale até o fim da conversa com o chatbot e viaja no Acionar outro fluxo |
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
| 41 | Agendar envio | P | F | Aguardar até numa data (fixa ou de uma resposta, com dias antes/depois) + Enviar mensagem | aguardar-data-e-guardar-valor.test | até um ano à frente; data passada, vazia ou fora do formato segue por "Sem data válida" |
| 42 | Horário comercial | P | F | Horários + Dias da semana; feriados no Horários | motor.test, feriados-horas-links-oferta.test | nacionais calculados (Páscoa móvel); Carnaval e Corpus Christi opcionais; estaduais e municipais a empresa escreve |
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

## Evidência pela tela

Capturas do editor montado com o código desta branch (Playwright, 1440×960), sem banco: a API é simulada na página. O simulador usa o mesmo motor do WhatsApp; o relógio do navegador foi fixado nas datas indicadas.

- `evidence/chatbot-umbler-fase-3/f1-recuperar-pix.png` — modelo pronto "Recuperar Pix ou carrinho" montado no quadro.
- `evidence/chatbot-umbler-fase-3/f2-link-de-pagamento.png` — painel do Enviar link de pagamento (link, valor, Pix).
- `evidence/chatbot-umbler-fase-3/f3-escolher-com-prazo.png` — Pedir para escolher com prazo de resposta, no quadro.
- `evidence/chatbot-umbler-fase-3/f3b-escolher-prazo.png` — Pedir para escolher com prazo de resposta, no painel.
- `evidence/chatbot-umbler-fase-3/f4-digitar-formato.png` — Pedir para digitar com o formato da resposta.
- `evidence/chatbot-umbler-fase-3/f4b-digitar-prazo.png` — Pedir para digitar com prazo de resposta.
- `evidence/chatbot-umbler-fase-3/f5-transferir-rodizio.png` — Transferir p/ atendente no modo rodízio.
- `evidence/chatbot-umbler-fase-3/f6-ideias.png` — painel de modelos prontos.
- `evidence/chatbot-umbler-fase-3/g1-confirmacao.png` — modelo "Confirmar agendamento" organizado no quadro.
- `evidence/chatbot-umbler-fase-3/g2-reagendar.png` — painel do Reagendar horário.
- `evidence/chatbot-umbler-fase-3/g3-cancelar.png` — painel do Cancelar agendamento.
- `evidence/chatbot-umbler-fase-3/g4-etapa-do-funil.png` — condição Etapa do funil com funil e etapa escolhidos.
- `evidence/chatbot-umbler-fase-3/g5-produto.png` — painel do Enviar produto, com a lista do Catálogo.
- `evidence/chatbot-umbler-fase-3/g6-localizacao.png` — painel do Enviar localização.
- `evidence/chatbot-umbler-fase-3/g7-contato.png` — painel do Enviar contato.
- `evidence/chatbot-umbler-fase-3/g8-ideias.png` — os 19 modelos prontos, começo da lista.
- `evidence/chatbot-umbler-fase-3/g9-ideias-fim.png` — os 19 modelos prontos, fim da lista.
- `evidence/chatbot-umbler-fase-3/h1-colado.png` — passo colado com Ctrl+V (o quadro foi de 11 para 12 passos).
- `evidence/chatbot-umbler-fase-3/h2-salvo-auto.png` — "Salvo automaticamente" com o fluxo desligado.
- `evidence/chatbot-umbler-fase-3/h3-ligado-nao-salva.png` — fluxo ligado: nada é salvo sozinho.
- `evidence/chatbot-umbler-fase-3/i1-horarios-feriados.png` — Horários com feriados nacionais, Carnaval/Corpus Christi e os dias da empresa.
- `evidence/chatbot-umbler-fase-3/i2-oferta.png` — painel do Enviar oferta com a data de validade.
- `evidence/chatbot-umbler-fase-3/i3-links.png` — avisos de link no Enviar mensagem: javascript: e link incompleto bloqueiam, http:// avisa.
- `evidence/chatbot-umbler-fase-3/i4-digitar-hora.png` — Pedir para digitar no formato Hora (hh:mm).
- `evidence/chatbot-umbler-fase-3/i5-teste-oferta.png` — simulador em 03/11: oferta com "Válida até 30/11/2026", e "às 15h" guardado como 15:00.
- `evidence/chatbot-umbler-fase-3/i6-teste-vencida.png` — simulador em 01/12: a oferta venceu e o fluxo seguiu por "Oferta vencida".
- `evidence/chatbot-umbler-fase-3/i7-teste-feriado.png` — simulador em 25/12: o Horários seguiu por "Fora do horário".
- `evidence/chatbot-umbler-fase-3/j1-aguardar-data.png` — Aguardar até numa data guardada numa resposta, 1 dia antes, às 9h.
- `evidence/chatbot-umbler-fase-3/j2-guardar-valor.png` — painel do Guardar em variável.
- `evidence/chatbot-umbler-fase-3/j3-formulario-prazo.png` — Enviar formulário com prazo de 30 minutos por pergunta e a saída "Não respondeu a tempo".
- `evidence/chatbot-umbler-fase-3/j4-agenda-prazo.png` — Agendar horário com prazo de 1 hora e a saída "Não respondeu a tempo".
- `evidence/chatbot-umbler-fase-3/j5-teste-esperando-vespera.png` — simulador em 03/11: o contato responde 10/11/2026 e o fluxo espera até 09/11/2026 às 09:00.
- `evidence/chatbot-umbler-fase-3/j6-teste-lembrete.png` — simulador depois de "Pular espera": o lembrete sai com a data e o nome guardado pelo Guardar em variável.

## Pendências (o que falta, por quê, próxima ação)

- **Feito em 03/11 (segunda rodada):** feriados no Horários (42), formato hora (26), conferência de links (06) e Enviar oferta com validade (17).
- **A1 — Prazo de resposta** (cards 37/38): feito nas perguntas, no Enviar formulário (por pergunta) e no Agendar/Reagendar horário (a partir da lista), com invariante no banco para o formulário (`chatbot-prazo-da-resposta`).
- **V1 — Versões publicadas imutáveis:** pede tabela de versões (migration nova, não destrutiva) e decisão de produto (publicar ≠ salvar). Próxima ação: desenhar e aprovar.
- **Cards 07, 08, 16, 33, 47, 48:** feitos, reaproveitando o que já existia (cartão de contato da Inbox, Catálogo, funil, handlers da Agenda).
- **B (bloqueados):** 11, 18, 19 e a geração de link/boleto (13, 15) — dependem de conta de pagamento da empresa ligada ao CRM ou de recurso que o canal não oferece.
- **Modelos prontos:** 19 (os 18 do prompt, com "captura de leads" atendida por "Coletar dados" e "transferência para IA" pela "Triagem com o agente de IA").
- **Pré-existente, fora do chatbot (resolvido em 03/11):** o commit de 21/10 do fork deixava `pnpm lint:channels` e `pnpm lint` vermelhos. A exclusão de conta (`lib/exportacao/exclusao.ts`) passou a desligar os números por `lib/channels/desligar-canal.ts`, sem nomear o provedor; `lib/rate-limit-helper.ts` e a rota de webhook do QR Code ganharam tipos no lugar de `any`; e os validadores `.cjs` do guia security-audit ficaram sob uma regra de CommonJS no `eslint.config.mjs`. Para conferir: `pnpm lint:channels && pnpm lint`.
