---
impacto: capacidade_nova
secao: adicionado
titulo: Setores de atendimento — a conversa vai para o setor certo e só os membros dele a recebem
---

A equipe pode ser dividida em setores (Vendas, Suporte, Financeiro…) em **Configurações › Setores**, com quem atende em cada um. Gerente ou administrador cria, edita e exclui.

- **Inbox:** o Transferir ganha a aba **Setor**, que manda a conversa para a fila do setor (se o responsável atual não for do setor, ela volta para a fila) ou a tira do setor. O cabeçalho mostra o setor, e a barra de filtros ganha o filtro por setor, que vale também para os números das abas.
- **Distribuição:** conversa com setor só é entregue a membros dele; o rodízio, a capacidade e o horário de cada pessoa continuam valendo.
- **Chatbot:** "Transferir para a equipe" ganha **Para quem** (equipe toda ou um setor), e o passo novo **Setor da conversa** decide o caminho pelo setor atual.

Excluir um setor não apaga conversa: elas só perdem a marca. Nada muda para quem não cria setores. A atualização aplica a migration 0496 pelo `update.sh`, sem ação manual.
