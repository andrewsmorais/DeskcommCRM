---
impacto: capacidade_nova
secao: adicionado
titulo: Conversas antigas do WhatsApp entram no atendimento, e as da queda do número voltam sozinhas
---

Em **Conexões**, cada número do WhatsApp pelo QR Code ganhou duas coisas:

- **Guardar o histórico anterior à vinculação** (desligado por padrão): o servidor do WhatsApp passa a guardar as conversas do número. Num número já conectado, guarda daqui em diante; o histórico antigo (cerca de 1 ano) só vem numa conexão nova. Ligar ou desligar reinicia a conexão por alguns segundos.
- **Trazer conversas antigas para o atendimento**: escolha o período (30, 90, 180 ou 365 dias), veja a prévia (quantas conversas, mensagens, áudios e imagens) e clique em **Importar**. Por padrão traz só quem já tem ficha no CRM. Dá para acompanhar e cancelar.

Nada do que é importado é respondido pela IA, abre atendimento, dispara automação ou avisa a equipe. Áudios e imagens que o WhatsApp não guarda mais aparecem como indisponíveis. Quem pediu para ser apagado (LGPD) não volta pela importação.

Quando o número cai e volta, as mensagens que os clientes mandaram enquanto ele estava fora entram sozinhas (com "Guardar o histórico" ligado), e a Central avisa o resumo e cada cliente que ficou sem resposta.

Quem atualiza pelo `update.sh` não precisa fazer nada (migration 0526; o agendador já roda a importação). Para usar, ligue "Guardar o histórico" na conexão — de preferência antes de conectar o número, para vir o histórico antigo.
