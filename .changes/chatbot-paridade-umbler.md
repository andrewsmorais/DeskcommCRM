---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — condições da conversa, Distribuir fluxo, Bloquear e Excluir contato, Iniciar manualmente
---

O editor de chatbot ganha os blocos da Umbler que faltavam, sem IA e sem mudança de banco:

- **Condições**: "Distribuir fluxo" (teste A/B por peso), "O contato está ativo?" (mensagem nas últimas N horas — a janela de 24h do WhatsApp), "Etiquetas" (tem alguma ou todas), "Primeira conversa?", "Canal da conversa" (qual número), "Atendente da conversa", "Presença do atendente" (alguém disponível agora, pela mesma regra da Distribuição de atendimento), "Bot paralelo em execução" (agente de IA ou outro chatbot na conversa) e "Status da conversa" (o contato está esperando resposta). O executor lê esses fatos uma vez por turno e só quando o desenho tem um desses passos.
- **Bloquear contato**: a mensagem (opcional) sai antes, depois o contato é bloqueado como quem pediu para sair — nem chatbot, nem IA, nem campanha escrevem mais — e a conversa é finalizada. Audita `contact.blocked`.
- **Excluir contato**: respeitando a LGPD, o chatbot não apaga nada; abre o pedido de exclusão dos dados (um por contato), avisa a equipe na Central e deixa nota na conversa. Um admin aprova em Configurações › LGPD.
- **Iniciar manualmente**: novo início de fluxo; na Inbox, o botão do robô no topo da conversa lista os chatbots ligados com esse início (só aparece se houver algum). O chatbot responde até o fluxo terminar mesmo com a conversa no nome do atendente. Rota `POST /api/v1/conversations/[id]/chatbot` (agent+), auditada como `chatbot_flow.started_manually`.
- **Testar**: o painel ganha "Situação do teste" para escolher as respostas dessas condições (primeira conversa, equipe disponível, outro bot, número, atendente).
