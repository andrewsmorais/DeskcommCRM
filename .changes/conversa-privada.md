---
impacto: capacidade_nova
secao: adicionado
titulo: Conversa privada — cadeado na Inbox e passo "Privar ou liberar" no chatbot
---

Uma conversa pode ficar **privada**: só o atendente responsável, gerentes, administradores e o super-admin a veem — mesmo quando a empresa deixa todo atendente ver tudo. Os outros atendentes deixam de ver a conversa, as mensagens e as notas dela, e a notificação de mensagem nova vai só para o responsável.

- **Inbox**: cadeado no topo da conversa, para o responsável e para os gestores. Privar exige que a conversa tenha responsável. Rota `POST /api/v1/conversations/[id]/privacy` (agent+; atendente só na conversa dele), auditada como `conversation.privacy_changed`.
- **Chatbot**: passo "Privar ou liberar" (chatbot avançado), com nota na conversa e auditoria.
- **Banco** (migration 0495, no baseline): `conversations.is_private` e a regra de visibilidade com privacidade aplicada à leitura de conversas e às três funções que a chamam por fora da RLS. Atualização automática pelo `update.sh`, sem passo manual.
