---
impacto: capacidade_nova
secao: adicionado
titulo: Reatribuição automática — tirar da conversa o atendente que está offline
---

Como na Umbler Talk:

- Em **Equipe › Atendimento**, cada atendente ganhou a coluna **"Reatribuição"**:
  - **Desligada** (padrão);
  - **Quando estiver offline**: se o contato escreve e o atendente está indisponível, ele sai da conversa;
  - **Sempre**: sai a cada mensagem nova do contato.
- Em **Configurações › Conversas**, a empresa escolhe o que acontece depois:
  - a conversa fica disponível para outro atendente (a distribuição escolhe quem pega);
  - ou um chatbot (com "Iniciar manualmente") começa na conversa.
- A conversa ganha uma nota explicando o que aconteceu. Grupos e conversas com o agente de IA não entram.

Nada a fazer na atualização: o `update.sh` cria a coluna nova (migration 0514), e quem já tem atendentes continua com "Desligada".
