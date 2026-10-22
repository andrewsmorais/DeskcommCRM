---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot Builder — fluxos de atendimento no WhatsApp, sem IA e sem custo de token
---

Novo módulo "Chatbots" no menu de IA, com editor visual no modelo da Umbler Talk: quadro com o botão "+" (menu de passos com busca, grupos, clique ou arraste), desfazer/refazer, "Alterações não salvas" e salvar (Ctrl+S). Passos da primeira fase: Iniciar por um canal (toda conversa nova ou por palavra-chave, num número ou em todos), Horários, Dias da semana, Mensagem contém, Enviar mensagem, Pedir para escolher (menu numerado, com tentativas e saída para resposta inválida), Pedir para digitar (guarda a resposta e permite usar {{variavel}}), Transferir para a equipe, Transferir para atendente, Editar etiquetas, Finalizar conversa e Bloco de notas. Com o fluxo ligado, ele responde no WhatsApp antes da IA, pelo mesmo envio das automações (janela de horário do número, espaçamento anti-bloqueio, guardas do contato); conversa com atendente humano não é tocada. O chatbot não usa IA em ponto nenhum. Ligar um fluxo desliga os outros da empresa, e o servidor recusa ligar um fluxo incompleto dizendo o que falta. Schema: migration 0489 (`chatbot_flows.grafo`, estado do motor em `chatbot_sessions`).
