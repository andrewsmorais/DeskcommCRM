# ChatAI Online × Umbler Talk — comparação item a item

> Feita em 13/11/2026. Régua: o lado ChatAI foi conferido **no código** da branch
> `chataionline/seguranca-auditoria`; o lado Umbler, nas páginas públicas da Umbler (fontes no fim).
> A central de ajuda da Umbler recusou a maior parte das leituras automáticas: o artigo dos blocos
> do chatbot **não foi lido** aqui. A paridade do chatbot veio das capturas que o dono mandou
> (ver `docs/audits/2026-11-03-chatbot-60-cards.md`).
>
> **Fora desta comparação, por decisão do dono:** planos e preços (não mexer); disparo em massa
> (desligado de propósito); API oficial da Meta (existe, mas como opção à parte, não o caminho
> principal); carrossel de produto, cupom, grupos no chatbot e "marcar como esperando".

Legenda: ✅ tem igual ou melhor · 🟡 tem parecido (diferença anotada) · ❌ não tem

## 1. Dentro de uma conversa

| Recurso da Umbler | ChatAI | Observação |
|---|---|---|
| Transferir para setor | ✅ | Setores + aba "Setor" no Transferir |
| Transferir para atendente | ✅ | |
| Transferir para **outro canal** (outro número) | ❌ | Hoje a conversa fica no número em que chegou |
| Privar atendimento (cadeado) | ✅ | Conversa privada |
| Detalhes do contato (telefone, foto, anotações, etiquetas) | ✅ | Painel lateral do CRM |
| Agendar mensagem (mensagem, nota ou chatbot), aba "Agendadas" | ✅ | Feito 13/11 (template não: o agendamento sai pelo QR code) |
| Detalhes da conversa: etiquetas, canal, setor, responsável, datas | ✅ | |
| Observadores da conversa ("Quem está vendo esse chat") | ✅ | Feito 13/11: iniciais de quem está com a conversa aberta, ao vivo; opção de ocultar administradores |
| Baixar o histórico da conversa em .txt ou .pdf | ✅ | Feito 13/11 |
| Chatbots executados e log de atividade da conversa | ✅ | Linha do tempo e passagens |
| **Finalizar enviando uma mensagem** ou **acionando um chatbot de finalização** | ✅ | Feito 13/11: a janela Fechar oferece Só encerrar, Despedida antes ou Chatbot de encerramento (este precisa ter o passo Finalizar conversa) |
| Notas internas | ✅ | Notas em tempo real |
| Assinar mensagens com o nome do atendente | ✅ | Feito 13/11 |
| Anexar arquivo, emojis, áudio | ✅ | |
| Respostas rápidas (pessoais ou da equipe) | ✅ | Digita "/" no campo |
| Figurinhas salvas para enviar | 🟡 | Mostra figurinha recebida; enviar figurinha depende do WAHA 2026.8.2 (`sendSticker`), e a versão fixada é a 2026.7.2 |

## 2. Canais

| Recurso da Umbler | ChatAI | Observação |
|---|---|---|
| WhatsApp por QR code (vários números) | ✅ | Caminho principal |
| API oficial do WhatsApp | ✅ | Opção à parte (decisão do dono) |
| Instagram e Messenger | ✅ | Pelo conector social (Zernio) |
| **Webchat** (chat no site do cliente) | ❌ | Não existe nada de webchat no código |

## 3. Chatbot

O chatbot do ChatAI tem **57 passos** (lista `PASSOS` de `lib/chatbot/passos.ts`), 19 modelos
prontos, rascunho e versões publicadas, copiar e colar, organizar blocos e testar. Os 60 cards de
referência estão conferidos em `docs/audits/2026-11-03-chatbot-60-cards.md`.

| Recurso da Umbler | ChatAI | Observação |
|---|---|---|
| Variáveis do contato e variáveis guardadas no fluxo | ✅ | `{{variavel}}` |
| Pedir para digitar com **regex próprio** (ex.: número de cartão, CPF) | 🟡 | Só formatos prontos: qualquer, e-mail, telefone, data, hora |
| Pedir para escolher, condições, transferências, nota, campos do contato | ✅ | |
| Transferir para agente de IA | ✅ | Escolhe qual agente |
| Agendar um chatbot para um contato numa data | ❌ | Depende do "agendar mensagem" da seção 1 |

### Bloco a bloco (capturas do menu da Umbler enviadas pelo dono em 13/11/2026)

| Bloco da Umbler | ChatAI | Observação |
|---|---|---|
| Iniciar por um canal · Iniciar manualmente | ✅ | Também "Iniciar por automação" |
| Dias da semana · Horários · Definir condição · Multi-condicional | ✅ | Horários com feriados |
| Aguardar intervalo · Aguardar até | ✅ | Na Umbler ficam em Condição; aqui, em Ação |
| Distribuir fluxo · O contato está ativo? · Etiquetas · Primeira conversa? | ✅ | |
| O contato é um grupo? | — | Fora por decisão (chatbot não roda em grupo) |
| Campo do contato (condição) | ✅ | Card próprio desde 13/11/2026 (`condicao_campo_contato`) |
| Setor · Canal · Atendente da conversa · Presença do atendente | ✅ | |
| Mensagem contém · Valor · Bot paralelo em execução · Status da conversa | ✅ | |
| Enviar mensagem · Criar uma nota no chat | ✅ | |
| Transferir para setor | ✅ | Aqui chama "Transferir para a equipe" (equipe toda ou um setor) |
| Editar etiquetas — do contato ou da conversa | ✅ | Escolha "Onde mexer" desde 13/11/2026; a condição Etiquetas olha as duas |
| Transferir p/ atendente · Transferir p/ agentes de IA · Privar ou liberar | ✅ | |
| Pedir para escolher · Pedir para digitar · Enviar template · Enviar formulário · Acionar outro fluxo | ✅ | Pedir para digitar sem regex próprio (ver acima) |
| Status esperando | — | Fora por decisão |
| Pedir para avaliar · Pedir feedback escrito · Campo do contato (ação) · Fluxo de espera · Notificar atendente | ✅ | |
| Visibilidade da conversa | ✅ | Feito 13/11: Visível, Oculta, Oculta até a próxima mensagem do contato |
| Excluir contato · Bloquear contato · Finalizar conversa · Bloco de notas · Webhook | ✅ | Excluir abre pedido LGPD em vez de apagar na hora |

Evidência pela tela dos dois blocos feitos em 13/11/2026 (editor de verdade, API simulada, sem banco):

- `evidence/chatbot-etiquetas-e-campo/a2-painel-campo-do-contato.png` — card "Campo do contato" em Condição, com o painel aberto (sem o "Olhar para").
- `evidence/chatbot-etiquetas-e-campo/a3-painel-etiquetas-conversa.png` — "Editar etiquetas" com "Onde mexer" em "Etiquetas da conversa"; o card mostra "Conversa: +urgente".
- `evidence/chatbot-etiquetas-e-campo/a4-menu-de-passos.png` — menu de passos: "Campo do contato" em Condição e em Ação, como na Umbler.

Evidência pela tela do bloco Visibilidade e do olho da conversa (13/11/2026, componentes de verdade, API simulada):

- `evidence/chatbot-visibilidade/v1-painel-visibilidade.png` — painel do bloco com as três opções.
- `evidence/chatbot-visibilidade/v2-menu-de-passos.png` — o bloco no menu de passos, em Ação.
- `evidence/chatbot-visibilidade/v3-olho-menu.png` — o olho da conversa aberto, com as três opções; à direita, o olho de uma conversa já oculta.

Evidência pela tela do agendamento de mensagem (13/11/2026, componente de verdade, API simulada):

- `evidence/mensagens-agendadas/g1-agendar-mensagem.png` — janela de agendar com o texto já escrito no campo.
- `evidence/mensagens-agendadas/g3-agendadas.png` — aba Agendadas: agendada (editar/cancelar), chatbot enviado e uma que não saiu, com o motivo.

Evidência pela tela do Fechar com despedida ou chatbot (13/11/2026, cabeçalho de verdade, API simulada):

- `evidence/fechar-com-despedida/f1-fechar-opcoes.png` — a janela Fechar com as três escolhas.
- `evidence/fechar-com-despedida/f2-despedida.png` — despedida escrita antes de fechar.
- `evidence/fechar-com-despedida/f3-chatbot-de-encerramento.png` — chatbot de encerramento escolhido; o botão vira "Acionar chatbot".
- `evidence/fechar-com-despedida/f4-chatbot-acionado.png` — aviso de que o chatbot encerra no passo "Finalizar conversa".

Evidência pela tela da assinatura e de Configurações › Conversas (13/11/2026, componentes de verdade, API simulada):

- `evidence/assinatura-e-conversas/a1-editar-assinatura.png` — lápis da assinatura no campo de mensagem (até 75 letras).
- `evidence/assinatura-e-conversas/a2-assinar-ligado.png` — chave de assinatura ligada antes de enviar.
- `evidence/assinatura-e-conversas/a3-fechar-exige-despedida.png` — empresa exige despedida: o Fechar já abre com a mensagem padrão.
- `evidence/assinatura-e-conversas/a4-configuracoes-conversas.png` — a tela Configurações › Conversas.

Diferença deliberada: na Umbler o "Iniciar um chatbot e finalizar" encerra na hora; aqui a conversa fica aberta até o chatbot chegar ao passo "Finalizar conversa", para a pesquisa de satisfação não ser cortada.

Evidência pela tela do Pedir para digitar com várias respostas (13/11/2026, painel de verdade do editor):

- `evidence/pedir-digitar-opcoes/d1-varias-respostas.png` — opções CPF e Placa (regra própria) e "Testar opções" dizendo "Seguiria por: Placa".
- `evidence/pedir-digitar-opcoes/d2-regra-recusada.png` — regra que travaria o atendimento, recusada com o motivo.

Evidência pela tela das opções extras dos blocos (13/11/2026, painel de verdade do editor, API simulada):

- `evidence/chatbot-opcoes-extras/e1-estatistica-do-bloco.png` — estatística de um menu: conclusões, % por saída e "Baixar CSV do fluxo".
- `evidence/chatbot-opcoes-extras/e2-notificar-quem.png` — Notificar atendente com atendente escolhida e "Somente se estiver disponível".

Evidência do histórico baixado em PDF (13/11/2026, gerado pelo código de verdade):

- `evidence/historico-da-conversa/h1-pdf-do-historico.png` — topo da primeira página do PDF do histórico.

Evidência dos extras da conversa (13/11/2026): o histórico em PDF está na imagem citada acima; encaminhar, favoritar, quem está vendo e reatribuição têm testes de rota e de consumidor (sem prova de tela nesta rodada).

Só no ChatAI: Enviar mídia, Enviar produto, Enviar localização, Enviar contato, Enviar oferta,
Enviar link de pagamento, Guardar em variável, Etapa do funil, Negócio no funil, Agendar /
Reagendar / Cancelar horário, Iniciar follow-up, Iniciar por automação.

## 4. CRM, equipe e relatórios

| Recurso da Umbler | ChatAI | Observação |
|---|---|---|
| Funil visual (pipelines) | ✅ | |
| Distribuição automática de leads | ✅ | Rodízio, menos conversas, quem atendeu antes |
| Filtros por setor, atendente e etiqueta | ✅ | |
| Permissões de gestor, permissões avançadas | ✅ | 4 papéis + setores |
| Logs e auditoria | ✅ | |
| Relatórios por atendente, tempo de espera, volume | 🟡 | Tela Métricas tem números por atendente (últimos 30 dias); "tempo de espera do cliente" não foi conferido |
| Multimarca | ✅ | Marca própria |

## 5. Agentes de IA

| Recurso da Umbler | ChatAI | Observação |
|---|---|---|
| Agente com base de conhecimento | ✅ | |
| Processos e skills do agente | ✅ | |
| Testar o agente antes de ligar | ✅ | |
| Créditos de IA comprados à parte | — | Decisão do dono: IA sem limite visível no plano |

## 6. O que só o ChatAI tem

Radar, prospecção, importação de planilha, produtos/comandas e propostas, memória do agente,
agente que organiza o CRM sozinho, índice de atrito, passagem IA → humano com contexto, agenda
integrada ao chatbot (agendar, reagendar, cancelar), follow-up com modelos, avisos de venda da
Kiwify, Cakto e Hotmart, chat de ajuda com IA dentro do CRM.

## 7. O que falta para ficar igual — ordem sugerida

| # | O quê | Tamanho | Por quê nesta ordem |
|---|---|---|---|
| 1 | **Agendar mensagem na conversa** (texto, nota ou chatbot), com aba "Agendadas" | médio | É o recurso mais visível que falta, e destrava o "agendar chatbot" |
| 2 | ~~Finalizar com mensagem ou chatbot de finalização~~ — feito 13/11 | pequeno | Usado em todo atendimento (pesquisa de satisfação no fim) |
| 3 | ~~Assinatura do atendente nas mensagens~~ — feito 13/11 | pequeno | Rápido e o cliente nota |
| 4 | ~~Regex próprio no Pedir para digitar~~ — feito 13/11 | pequeno | Precisa de trava contra regex que trava o servidor |
| 5 | **Baixar histórico** da conversa (.txt e .pdf) | pequeno | |
| 6 | **Observadores** da conversa | médio | Mexe em quem vê a conversa (segurança) |
| 7 | **Transferir para outro número** | médio | Mexe na cadeia de envio |
| 8 | **Figurinhas salvas** | pequeno | |
| 9 | **Webchat** no site | grande | Canal novo inteiro |
| ~~C1~~ | ~~Chatbot: Editar etiquetas da conversa~~ | feito 13/11 | |
| ~~C2~~ | ~~Chatbot: card Campo do contato em Condição~~ | feito 13/11 | |
| ~~C3~~ | ~~Chatbot: Visibilidade da conversa~~ | feito 13/11 | |

## 8. Levantamento direto no app da Umbler (13/11/2026)

Feito no navegador do dono, logado na conta de teste dele: os textos de tela e de ajuda saíram dos
arquivos do próprio app (Blazor), e o card "Visibilidade da conversa" foi aberto no editor. Nada
foi salvo na conta da Umbler. Lado ChatAI conferido no código desta branch.

### Chatbot — o que os blocos da Umbler fazem e o nosso não

| # | Bloco / opção na Umbler | ChatAI hoje |
|---|---|---|
| U1 | Visibilidade da conversa: Visível · Oculto · Oculto até a próxima mensagem do contato | ✅ feito 13/11 (migration 0510) |
| U2 | Pedir para digitar com várias opções de resposta, cada uma com formato nativo (telefone, CPF, e-mail…) ou regex; botão "Testar opções"; a saída é a primeira opção que bate | ✅ feito 13/11 ("Aceitar várias respostas", com trava contra regra que trava o servidor) |
| U3 | Transferir p/ atendente: também "por variável", "atendente anterior na mesma conversa" e "Remover" | ✅ feito 13/11 |
| U4 | Transferir para setor: "setor da conversa anterior", "setor anterior na mesma conversa" e caminho alternativo se falhar | 🟡 feito "o setor em que a conversa já estava" (13/11); sem caminho alternativo — falha vai para a equipe toda, com nota |
| U5 | Notificar atendente: escolher atendentes específicos, "somente se disponível" e caminho se ninguém puder ser avisado | ✅ feito 13/11 (ninguém alcançável → Central de avisos, em vez de outro caminho) |
| U6 | Enviar mensagem com botão de link (vira texto no QR code) e "seguir outro caminho se a mensagem não sair" | 🟡 botão de link feito 13/11; "outro caminho se não sair" não (o motor decide o caminho antes de enviar) |
| U7 | Iniciar manualmente: "Não listado" e variáveis perguntadas ao atendente na hora de iniciar | ✅ feito 13/11 |
| U8 | Fluxo de inatividade: roda quando o contato some | ✅ coberto por follow-up de silêncio e automação (ver seção 9) |
| U9 | Aguardar até com "dia útil", "próximo dia" e expressão de agenda (CRON) | 🟡 dia útil (pula feriado) e próximo dia feitos 13/11; CRON não |
| U10 | **Bot paralelo**: iniciar sem encerrar o fluxo que já roda | ❌ |
| U11 | **Finalizar conversa**: escolher quem aparece como quem fechou | ❌ |
| U12 | Estatística por bloco: % por saída e nº de execuções, com exportar CSV | ✅ feito 13/11 (migration 0512) |
| U13 | **Resumo por IA** do último atendimento, salvo como nota | ❌ (gasta IA — decisão do dono) |
| U14 | Integrações em bloco: **Pipedrive**, **Asaas** (cobranças/Pix) | ❌ |

### Fora do chatbot — o que a Umbler tem e o ChatAI não

| # | Recurso | Observação |
|---|---|---|
| G1 | Ocultar conversa na caixa de entrada + filtro "Ocultas" | ✅ feito 13/11 (olho no topo da conversa) |
| G2 | Mascarar o telefone dos contatos por papel/atendente (busca e exportação também mascaram) | ❌ não feito: o telefone aparece em ~45 telas e chega ao navegador pela leitura direta do banco; esconder de verdade pede mudar a permissão da coluna e todas essas leituras — tarefa própria |
| G3 | Reatribuição de chats: tira o atendente offline quando o contato escreve | ✅ feito 13/11 (migration 0514) |
| G4 | **Atalhos de chatbot** fixados no rodapé do campo de mensagem | temos o botão do robô no topo |
| G5 | **Chat interno da equipe** | |
| G6 | Encaminhar e favoritar mensagens | ✅ feito 13/11 (migration 0513) |
| G7 | **Kanban de contatos** por etiqueta, com resumo por coluna | temos funil de negócios |
| G8 | Variáveis da organização (chaves e valores guardados uma vez, usados nos fluxos) | ✅ feito 13/11: Configurações › Variáveis da empresa, `{{empresa.chave}}` nos chatbots, no WebHook e nas respostas rápidas |
| G9 | Importar contatos de .vcf | ✅ feito 13/11: a mesma janela da planilha aceita .vcf (nome, celular, e-mail, aniversário) |
| G10 | Assinatura do atendente e mensagem de encerramento por perfil/empresa | ✅ feito 13/11 (Configurações › Conversas e Perfil) |

## 9. Correção da lista (13/11/2026, depois de reler o CRM inteiro)

A seção 8 comparou bloco a bloco e deixou de fora o que o CRM resolve por OUTRO caminho. Conferido no código:

| Item da seção 8 | O que o CRM já tem | Situação |
|---|---|---|
| U8 Fluxo de inatividade | **Follow-ups** com gatilho de **silêncio do contato em minutos** (`lib/followup/silence-sweep.ts`), automação "N dias sem mensagem" (`lead.silent_for`, do cliente/da equipe) com as ações Iniciar chatbot e Iniciar fluxo, e o **prazo de resposta** nas perguntas do chatbot | ✅ coberto (sai da lista) |
| Agendamento | Chatbot **Agendar / Reagendar / Cancelar horário** na Agenda do CRM; o **agente de IA agenda sozinho**; tipos de agendamento | ✅ já existia — não confundir com "agendar uma MENSAGEM" (abaixo) |
| Transferir para outro número | "Continuar por outro número" na conversa (`hooks/inbox/useContinuarPorOutroNumero.ts`) | ✅ coberto |
| G4 Atalhos de chatbot | Botão do robô no topo da conversa (chatbots com Iniciar manualmente) | ✅ coberto (lá fica no rodapé; aqui, no topo) |
| G7 Kanban de contatos | Funis (Kanban de negócios), Contatos, Empresas, Pessoas | ✅ coberto na prática |

**O que de fato falta**, depois da correção:
1. ~~Agendar uma MENSAGEM na conversa~~ — feito 13/11 (migration 0511): botão de calendário no campo de mensagem, aba "Agendadas".
2. ~~**Finalizar** o atendimento enviando mensagem ou chatbot de encerramento~~ — feito 13/11: a janela Fechar oferece Só encerrar, Despedida antes ou Chatbot de encerramento.
3. ~~**Assinatura do atendente** nas mensagens~~ — feito 13/11, junto com a tela Configurações › Conversas (assinatura sempre/nunca/atendente escolhe; comportamento do Fechar com mensagem e chatbot padrão; despedida pessoal no Perfil).
4. ~~**Pedir para digitar** com várias opções e regex próprio~~ — feito 13/11 ("Aceitar várias respostas", "Testar opções").
5. ~~Opções dentro de blocos~~ — feito 13/11: modos de transferir (variável, mesma conversa, remover, setor da conversa), Notificar com escolha e "só se disponível", botão de link, "não listado" e perguntas no Iniciar manualmente, dia útil no Aguardar até e estatística por bloco com CSV. Ficaram de fora o "outro caminho se falhar" (o motor decide antes de enviar) e o CRON.
6. ~~Conversa~~ — feito 13/11: baixar histórico (.txt/.pdf), encaminhar e favoritar, quem está vendo a conversa, reatribuição do atendente offline. Ficaram de fora: figurinhas salvas (o WAHA fixado não envia figurinha) e mascarar telefone (tarefa grande e própria).
7. Maiores — feito 13/11: variáveis da empresa e importar .vcf (fotos em `evidence/variaveis-e-vcf/v1-importar-aceita-vcf.png`, `evidence/variaveis-e-vcf/v2-resumo-da-importacao.png`, `evidence/variaveis-e-vcf/v3-variaveis-da-empresa.png` e `evidence/variaveis-e-vcf/v4-ajuda-do-chatbot.png`; telas montadas com respostas simuladas, sem banco). Faltam o webchat no site e o chat interno da equipe.

**O que o ChatAI tem e a Umbler não** (para a oferta): agente de IA com agenda, follow-ups visuais com IA e gatilhos (silêncio, etapa, caso, retorno), roteadores entre agentes, memória e casos, propostas e comandas, prospecção e radar, chamadas por telefone (SIP), Nuvemshop, Kiwify, Cakto e Hotmart, conversões do Meta Ads, LGPD completa, auditoria, API e MCP, marca própria, Empresas/Pessoas (B2B), tarefas, honorários e faturamento.

## Fontes

- [Umbler Talk — página oficial](https://a.umbler.com/br/talk/)
- [Umbler — CRM para WhatsApp](https://www.umbler.com/br/talk/crm-whatsapp)
- [Funcionalidades básicas dentro de uma conversa no Talk](https://help.umbler.com/hc/pt-br/articles/14247847407885-Funcionalidades-b%C3%A1sicas-dentro-de-uma-conversa-no-Talk)
- [Uso de variáveis em um fluxo de chatbot (comunidade Umbler)](https://community.umbler.com/br/t/uso-de-variaveis-em-um-fluxo-de-chatbot-no-umbler-talk/3686)
- Não lidos (a página recusou a leitura): [Blocos do chatbot](https://help.umbler.com/hc/pt-br/articles/17201520926861-Como-criar-um-chatbot-com-fluxograma-Blocos-do-chatbot), [Diferenças entre planos](https://help.umbler.com/hc/pt-br/articles/31195635035533-Principais-diferen%C3%A7as-entre-planos-Talk), [Variáveis no Talk](https://help.umbler.com/hc/pt-br/articles/33960785105421-Como-usar-vari%C3%A1veis-no-Talk)
