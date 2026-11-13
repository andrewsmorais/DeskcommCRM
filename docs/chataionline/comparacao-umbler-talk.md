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
| **Agendar mensagem** (mensagem, nota, chatbot ou template), aba "Agendadas" para editar/excluir | ❌ | O CRM agenda follow-ups e espera no chatbot, mas não tem "agendar esta mensagem" na conversa |
| Detalhes da conversa: etiquetas, canal, setor, responsável, datas | ✅ | |
| **Observadores** da conversa | ❌ | |
| **Baixar o histórico** da conversa em .txt ou .pdf | ❌ | Existe exportar a conta inteira (ZIP), não uma conversa |
| Chatbots executados e log de atividade da conversa | ✅ | Linha do tempo e passagens |
| **Finalizar enviando uma mensagem** ou **acionando um chatbot de finalização** | 🟡 | Finalizar só encerra; o chatbot pode finalizar, mas o botão Finalizar não manda mensagem nem chama chatbot |
| Notas internas | ✅ | Notas em tempo real |
| **Assinar mensagens** com o nome do atendente | ❌ | |
| Anexar arquivo, emojis, áudio | ✅ | |
| Respostas rápidas (pessoais ou da equipe) | ✅ | Digita "/" no campo |
| **Figurinhas salvas** para enviar | 🟡 | Mostra figurinha recebida; não guarda nem envia figurinha |

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
| **Campo do contato** (condição) | 🟡 | Existe dentro do Definir condição/Multi-condicional (regra "campo do contato"), mas não como card próprio |
| Setor · Canal · Atendente da conversa · Presença do atendente | ✅ | |
| Mensagem contém · Valor · Bot paralelo em execução · Status da conversa | ✅ | |
| Enviar mensagem · Criar uma nota no chat | ✅ | |
| Transferir para setor | ✅ | Aqui chama "Transferir para a equipe" (equipe toda ou um setor) |
| **Editar etiquetas — do contato ou da conversa** | 🟡 | Só etiqueta do contato; a conversa tem etiquetas próprias na Inbox, mas o chatbot não mexe nelas |
| Transferir p/ atendente · Transferir p/ agentes de IA · Privar ou liberar | ✅ | |
| Pedir para escolher · Pedir para digitar · Enviar template · Enviar formulário · Acionar outro fluxo | ✅ | Pedir para digitar sem regex próprio (ver acima) |
| Status esperando | — | Fora por decisão |
| Pedir para avaliar · Pedir feedback escrito · Campo do contato (ação) · Fluxo de espera · Notificar atendente | ✅ | |
| **Visibilidade da conversa** | ❓ | A Umbler tem este card **separado** do "Privar ou liberar". O que ele faz não foi confirmado — falta a captura do painel dele |
| Excluir contato · Bloquear contato · Finalizar conversa · Bloco de notas · Webhook | ✅ | Excluir abre pedido LGPD em vez de apagar na hora |

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
| 2 | **Finalizar com mensagem ou chatbot de finalização** | pequeno | Usado em todo atendimento (pesquisa de satisfação no fim) |
| 3 | **Assinatura do atendente** nas mensagens | pequeno | Rápido e o cliente nota |
| 4 | **Regex próprio** no Pedir para digitar | pequeno | Precisa de trava contra regex que trava o servidor |
| 5 | **Baixar histórico** da conversa (.txt e .pdf) | pequeno | |
| 6 | **Observadores** da conversa | médio | Mexe em quem vê a conversa (segurança) |
| 7 | **Transferir para outro número** | médio | Mexe na cadeia de envio |
| 8 | **Figurinhas salvas** | pequeno | |
| 9 | **Webchat** no site | grande | Canal novo inteiro |
| C1 | Chatbot: **Editar etiquetas da conversa** (além das do contato) | pequeno | Bloco da Umbler |
| C2 | Chatbot: card **Campo do contato** em Condição | pequeno | Já funciona dentro do Definir condição; falta o card |
| C3 | Chatbot: **Visibilidade da conversa** | ? | Depende de saber o que o card da Umbler faz |

## Fontes

- [Umbler Talk — página oficial](https://a.umbler.com/br/talk/)
- [Umbler — CRM para WhatsApp](https://www.umbler.com/br/talk/crm-whatsapp)
- [Funcionalidades básicas dentro de uma conversa no Talk](https://help.umbler.com/hc/pt-br/articles/14247847407885-Funcionalidades-b%C3%A1sicas-dentro-de-uma-conversa-no-Talk)
- [Uso de variáveis em um fluxo de chatbot (comunidade Umbler)](https://community.umbler.com/br/t/uso-de-variaveis-em-um-fluxo-de-chatbot-no-umbler-talk/3686)
- Não lidos (a página recusou a leitura): [Blocos do chatbot](https://help.umbler.com/hc/pt-br/articles/17201520926861-Como-criar-um-chatbot-com-fluxograma-Blocos-do-chatbot), [Diferenças entre planos](https://help.umbler.com/hc/pt-br/articles/31195635035533-Principais-diferen%C3%A7as-entre-planos-Talk), [Variáveis no Talk](https://help.umbler.com/hc/pt-br/articles/33960785105421-Como-usar-vari%C3%A1veis-no-Talk)
