---
impacto: capacidade_nova
secao: adicionado
titulo: Nuvemshop — pedidos, Pix e boleto e carrinho abandonado viram negócio no funil
---
A loja **Nuvemshop** conectada em Integrações › Nuvemshop agora faz o mesmo que Shopify e Yampi, em **todos os planos**: cada pedido (Pix ou boleto gerado, pago, reembolsado, cancelado sem pagamento) vira contato + negócio na etapa com o nome do evento, e os **carrinhos abandonados** são lidos da loja a cada 15 minutos, com o link que retoma a compra. O pedido herda o negócio do carrinho da mesma pessoa, e a recuperação pelo follow-up funciona igual às outras lojas.

Os pedidos entram por uma fonte **Nuvemshop** em Webhooks › Receber dados, criada sozinha na primeira venda; ali se troca o funil e a etapa. Para conectar, a instalação precisa do app da Nuvemshop cadastrado no Portal de Parceiros (com a permissão de ler pedidos) e das variáveis `NUVEMSHOP_APP_ID`, `NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET`.

Corrigido: no formato simples usado pelo Wix, Make e Zapier, os eventos `aguardando_pagamento`, `reembolso` e `pagamento_expirado` (entre outros) eram ignorados; agora entram.
