---
impacto: capacidade_nova
secao: adicionado
titulo: Agendar mensagem, nota ou chatbot dentro da conversa
---

No campo de mensagem da conversa há um botão novo (calendário) para **agendar**, como na Umbler Talk:

- **Mensagem para o contato**, **nota interna** (só a equipe vê) ou um **chatbot** de início manual, num dia e hora escolhidos — de 1 minuto até um ano à frente.
- No horário, sai **em nome de quem agendou**, pelo mesmo caminho do envio pela tela.
- A aba **Agendadas** lista o que está marcado, o que saiu e o que não saiu (com o motivo); quem agendou, ou um gerente, pode **editar** ou **cancelar** enquanto não saiu.
- Se não puder sair (contato bloqueado, quem agendou saiu da equipe, chatbot desligado, WhatsApp recusou), nada é reenviado e a conversa ganha uma nota interna dizendo por quê.
- Anonimizar o contato (LGPD) apaga as agendadas dele; o pedido de acesso aos dados as inclui.

Nada a fazer na atualização: o `update.sh` cria a tabela, e o envio no horário é feito pelo worker que já existe — nenhum serviço novo.
