# Kiwify e Cakto: venda que vira conversa no WhatsApp

Quando a Kiwify ou a Cakto avisam o CRM (carrinho abandonado, Pix gerado,
compra aprovada...), o pedido vira **um negócio** no funil, que **anda de
etapa** a cada aviso. Uma automação "Quando um lead mudar de etapa" com a ação
**Iniciar chatbot** manda o comprador para um fluxo no WhatsApp.

Código: `lib/webhooks/plataformas-de-venda.ts` (lê o aviso),
`lib/webhooks/negocio-da-venda.ts` (move o negócio),
`lib/automation/actions/start-chatbot-flow.ts` (a ação) e
`lib/chatbot/executar.ts` (`iniciarChatbotPorAutomacao`).

## Passo a passo

1. **Funil.** Num funil, crie as etapas com estes nomes. Maiúsculas e acentos
   não importam, e só as que você quiser usar:

   | Evento da plataforma | Nome da etapa (qualquer um) |
   | --- | --- |
   | Carrinho abandonado | Carrinho abandonado · Abandono de carrinho · Carrinho |
   | Pix, boleto ou PicPay gerado | Aguardando pagamento · Pix gerado · Boleto gerado · Pagamento pendente |
   | Compra aprovada | Pago · Compra aprovada · Venda aprovada · Aprovado · Cliente |
   | Compra recusada | Compra recusada · Pagamento recusado · Recusado |
   | Reembolso | Reembolsado · Reembolso · Estornado |
   | Chargeback | Chargeback · Contestado |
   | Assinatura cancelada / atrasada / renovada | Assinatura cancelada · Assinatura atrasada · Assinatura renovada |

   Evento sem etapa com nome conhecido atualiza os campos do negócio e o deixa
   onde está.

2. **Fonte de captação.** Em Automações › Fontes, crie uma fonte apontando para
   esse funil (a etapa padrão é onde cai o que não tem etapa própria). Copie o
   endereço dela (`https://<seu-crm>/api/v1/webhooks/in/<token>`).
   - **Segredo (recomendado):** cadastre na fonte o mesmo segredo da plataforma.
     Na **Cakto**, é o `secret` que ela manda no corpo. Na **Kiwify**, é o token
     do webhook: ela assina com `?signature=` (HMAC-SHA1 do corpo). O segredo da
     Cakto é apagado do log de recebimento.

3. **Plataforma.** Cadastre esse endereço como webhook na Kiwify ou na Cakto e
   marque os eventos que quer receber.

4. **Chatbot.** Em Chatbots, monte um fluxo que comece com **Iniciar por
   automação** e ligue-o. Ele pode ficar ligado junto com o fluxo de
   atendimento. Use as variáveis do negócio: `{{produto}}`, `{{link_checkout}}`,
   `{{valor}}` (só Cakto), `{{evento_da_venda}}`, `{{plataforma}}`,
   `{{id_do_pedido}}`, `{{negocio}}`.

5. **Automação.** Crie uma regra **Quando um lead mudar de etapa**, com a
   condição na etapa (ex.: "Pago" ou "Carrinho abandonado") e a ação **Iniciar
   chatbot**, escolhendo o fluxo e o número de WhatsApp. Para o primeiro aviso
   de um pedido (que cria o negócio), use também **Quando entrar um contato
   novo (webhook)**.

## Como o pedido vira um negócio só

- A chave do negócio é `plataforma:pedido` (`kiwify:<order_id>`). O mesmo
  pedido nunca cria um segundo negócio.
- O carrinho abandonado não tem pedido: a chave é a pessoa (telefone ou
  e-mail) mais o produto. Quando chega a compra da mesma pessoa e produto, ela
  **herda o negócio do carrinho**, que passa a ter a chave do pedido.
- O que não for achado no aviso fica de fora, nunca inventado. O valor só é
  lido da Cakto (ela manda em reais); a Kiwify muda o campo de valor entre
  eventos.
