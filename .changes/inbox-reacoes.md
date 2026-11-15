---
impacto: exige_acao
secao: adicionado
titulo: Reações do WhatsApp aparecem na conversa, e o atendente também pode reagir
---

Quando o cliente reage a uma mensagem no WhatsApp (👍, ❤️…), a reação aparece como uma marquinha no canto do balão, como no celular — e não como mensagem nova. Ela não reabre conversa encerrada, não conta como resposta do cliente e não dispara aviso, automação nem follow-up.

O atendente também pode reagir: na setinha do balão aparecem os cinco emojis mais usados por ele e um **+** para escolher qualquer outro. Não aparece para contato que pediu para não receber mensagens. Funciona no WhatsApp pelo QR Code e no WhatsApp oficial.

## Requer atenção

Quem atualiza pelo `update.sh` não precisa fazer nada: ele aplica o banco (migration 0525) e recria o WhatsApp com o evento de reação ligado. Quem atualiza à mão precisa rodar o `up -d` do compose inteiro (ou recriar o contêiner do WhatsApp) para ele passar a avisar as reações.
