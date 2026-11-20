---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — mais modos de transferir e Notificar com escolha de quem avisar
---

Como na Umbler Talk:

- **Transferir p/ atendente** ganhou três modos:
  - "Quem atendeu esta conversa antes": o último atendente desta mesma conversa;
  - "O atendente de uma variável": id ou e-mail de alguém da equipe, guardado antes no fluxo (por exemplo, por um WebHook);
  - "Remover o atendente da conversa": a conversa fica sem dono e o fluxo segue para o próximo passo.

  Se ninguém puder receber, a conversa vai para a fila da equipe, com uma nota explicando o porquê, como nos outros modos.
- **Transferir para a equipe** ganhou "O setor em que a conversa já estava" (o setor do atendimento anterior).
- **Notificar atendente** pode avisar só os atendentes escolhidos, com a opção "Somente se estiver disponível":
  - o aviso vai ao celular de cada um e fica como nota na conversa;
  - se ninguém puder ser avisado, vai para a Central de avisos, como antes.
