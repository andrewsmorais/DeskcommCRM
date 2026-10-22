---
impacto: exige_acao
secao: corrigido
titulo: Webhooks de entrada e de saída voltam a funcionar, e a anonimização de conta inteira não pula contatos
---

O nome da marca, com espaço, tinha ido parar no nome de dois cabeçalhos HTTP e do cookie do modo suporte. Nome de cabeçalho e de cookie não aceitam espaço. O resultado era que todo webhook de entrada respondia 500, porque a leitura do cabeçalho lançava erro, e o de saída levava um nome que o receptor não reconhece. Os nomes agora são `X-ChatAI-Event`, `X-ChatAI-Signature` e o cookie `chatai-impersonate`. **Ação:** quem já integrou um sistema ao webhook de saída e lia a assinatura legada precisa passar a ler `X-ChatAI-Signature`; `X-Webhook-Signature` não mudou.

A anonimização de uma organização inteira (pedido LGPD de escopo `tenant`) paginava por deslocamento sobre os contatos ainda não anonimizados. Como cada lote saía do filtro, os lotes seguintes pulavam contatos: com 250, ficavam 100 sem anonimizar e a conta era marcada como anonimizada. Agora o laço usa cursor de id e alcança todos. O status `pending_review`, que os workers LGPD já gravavam e o banco recusava, passa a ser aceito (migration 0483).
