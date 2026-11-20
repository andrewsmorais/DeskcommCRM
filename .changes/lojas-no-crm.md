---
impacto: capacidade_nova
secao: adicionado
titulo: Lojas virtuais na Captação — Shopify, Yampi, WooCommerce, CartPanda e Wix
---
Em **todos os planos**, a Captação (menu Webhooks › Receber dados) passa a entender o aviso das lojas **Shopify, Yampi, WooCommerce e CartPanda**, além de Kiwify, Cakto e Hotmart. O lojista cola o endereço da fonte na tela de webhooks da loja, e cada aviso vira contato + negócio na etapa com o nome do evento: **Carrinho abandonado**, **Aguardando pagamento** (Pix ou boleto gerado), **Pago**, **Pagamento recusado**, **Reembolsado**. O produto, o valor e o link do checkout ficam no negócio, prontos para o follow-up ou para a mensagem escrita pela IA recuperar a venda. O pedido herda o negócio do carrinho da mesma pessoa.

Shopify, Yampi e WooCommerce assinam cada aviso, e a tela ganhou o campo **Chave de assinatura da loja** para conferir a assinatura. A CartPanda não assina: o endereço secreto é a proteção (o endereço leva `?plataforma=cartpanda`). O **Wix** entra pelas Automações do próprio Wix, num formato simples com `evento_da_venda`, nome, telefone, produto, valor e link — o mesmo formato serve para Make, Zapier e n8n. A tela traz o passo a passo de cada loja.

Receber o aviso não custa nada, então a recuperação vale no **Essencial** também: lá, o follow-up pode começar sozinho pelas etapas de recuperação (Carrinho abandonado, Aguardando pagamento, Pagamento recusado ou expirado), com mensagem de texto e espera de tempo fixo. A mensagem escrita pela IA continua a partir do Impulso. Formulários, Zapier e o resto da Captação seguem no Impulso.
