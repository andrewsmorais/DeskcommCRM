---
impacto: capacidade_nova
secao: adicionado
titulo: Kiwify e Cakto — o pedido vira um negócio que anda de etapa e pode disparar o chatbot
---

A fonte de captação de webhooks entende os avisos da Kiwify e da Cakto: o comprador (nome, telefone, e-mail) é lido de dentro do aviso, e cada pedido vira UM negócio no funil, que anda de etapa a cada aviso — carrinho abandonado, Pix ou boleto gerado, compra aprovada, recusada, reembolso, chargeback e assinatura —, pela etapa com o nome do evento ("Pago", "Aguardando pagamento", "Carrinho abandonado"...). A compra da mesma pessoa e produto herda o negócio do carrinho abandonado. O negócio ganha os campos `produto`, `link_checkout`, `evento_da_venda`, `plataforma`, `id_do_pedido` e, na Cakto, `valor` — que o chatbot usa como variáveis. Com segredo na fonte, a Cakto se prova pelo `secret` do corpo (que é apagado do log) e a Kiwify pela assinatura `?signature=`. Passo a passo em `docs/integracao/kiwify-e-cakto.md`. Sem mudança de banco.
