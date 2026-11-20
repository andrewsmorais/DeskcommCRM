---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — passo WebHook (chamar um sistema de fora e usar a resposta no fluxo)
---

Novo grupo "Integrações" no editor de chatbot, com o passo "WebHook": no meio da conversa, o chatbot chama um endereço (n8n, Make, o sistema da loja) por GET ou POST e guarda partes da resposta em variáveis — por exemplo `pedido.status` vira `{{status}}` na mensagem seguinte, e o código HTTP fica em `{{webhook_status}}`. A URL aceita as respostas do contato (`https://sualoja.example.com/pedidos/{{pedido}}`). Saídas "Deu certo" e "Falhou" (erro, mais de 8 segundos, endereço recusado). As mesmas guardas dos webhooks das automações: endereço interno da VPS é recusado antes e depois de resolver o nome, redirect não é seguido, assinatura `X-Webhook-Signature` com segredo opcional e cabeçalho `Authorization` opcional — os dois guardados cifrados no desenho do fluxo, nunca em texto. No máximo 3 chamadas por mensagem. Contrato em `docs/integracao/webhooks-de-saida.md`. Sem mudança de banco.
