---
impacto: capacidade_nova
secao: adicionado
titulo: Botão "Inserir variável" e a linha da mensagem que some quando o campo está vazio
---

- Na mensagem de WhatsApp das **Automações** e nas **Respostas rápidas**, o campo ganhou o botão **"Inserir variável"**, com busca, e uma **prévia** da mensagem com um contato de exemplo. A lista mostra só as variáveis que aquela tela troca de verdade. Na automação ele substitui os três botões fixos de antes (Nome, Telefone e Título do lead). A campanha continua com a lista de variáveis que já tinha.
- Novo **bloco condicional** `{{#campo}}...{{/campo}}`: o trecho entre a abertura e o fechamento só sai quando o campo tem valor. Se o bloco era a linha inteira, a linha some junto, e o cliente não recebe um rótulo sozinho, como `📧 E-mail:` sem nada depois. Vale na mensagem da automação. Nas respostas rápidas do Inbox e na campanha o trecho fica visível, para quem escreve ver o que falta preencher.

Texto sem `{{#` continua saindo exatamente como hoje. Ideia trazida do produto original.
