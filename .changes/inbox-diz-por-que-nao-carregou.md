---
impacto: nada_mudou
secao: corrigido
titulo: O Inbox diz por que a lista não carregou e não some com as conversas quando o servidor está lento
---

Quando a lista de conversas não consegue carregar, a tela agora diz o motivo: "a consulta excedeu o tempo limite", "o servidor não respondeu agora" ou "sua sessão expirou", em vez de "Erro inesperado". Avisa que as conversas continuam salvas e oferece "Tentar novamente" sem recarregar a página.

Se uma atualização falha com a lista já na tela, as conversas ficam onde estão. As leituras passam a repetir também em 502 e 504; as escritas (enviar mensagem) continuam repetindo só quando o servidor diz que nada foi feito, para não duplicar mensagem.

Trazido do produto original.
