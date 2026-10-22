---
impacto: nada_mudou
secao: corrigido
titulo: Webhooks de entrada e de saída voltam a funcionar, e a anonimização de conta inteira não pula contatos
---

O nome da marca, com espaço, tinha ido parar no nome de dois cabeçalhos HTTP e do cookie do modo suporte. Nome de cabeçalho e de cookie não aceitam espaço: todo webhook de entrada respondia 500, porque a leitura do cabeçalho lançava erro, e o de saída nem saía, porque o `fetch` recusa o nome antes de enviar. Os nomes agora são `X-ChatAI-Event`, `X-ChatAI-Signature` e o cookie `chatai-impersonate`. Como o nome antigo nunca chegou a funcionar, nenhuma integração dependia dele.

A anonimização de uma organização inteira (pedido LGPD de escopo `tenant`) paginava por deslocamento sobre os contatos ainda não anonimizados. Como cada lote saía do filtro, os lotes seguintes pulavam contatos: com 250, ficavam 100 sem anonimizar e a conta era marcada como anonimizada. Agora o laço usa cursor de id e alcança todos. O status `pending_review`, que os workers LGPD já gravavam e o banco recusava, passa a ser aceito (migration 0483).
