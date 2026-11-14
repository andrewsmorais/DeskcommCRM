---
impacto: nada_mudou
secao: corrigido
titulo: Segurança — correções da auditoria de 14/11 (o que entrou desde a comparação com a Umbler)
---

Uma auditoria de segurança releu tudo o que entrou desde a comparação com a Umbler Talk. Nada grave; o que apareceu foi corrigido:

- **Telefone oculto**: um atendente marcado como "Oculto" conseguia voltar a ver os números trocando um cookie do navegador. Agora o cookie não decide nada, e qualquer falha na conferência esconde o número (migration 0519).
- **Chatbot — regra própria**: regras com muitas partes opcionais (`?`) ou faixas largas (`{0,99}`) podiam travar o atendimento de todas as empresas. Elas passam a ser recusadas ao salvar. Um fluxo antigo com uma regra dessas não casa mais com nada naquele passo: abra o fluxo e simplifique a regra.
- **Chatbot — WebHook**: a resposta do outro servidor é lida só até 64 KB; antes era lida inteira e cortada depois.
- **Importar .vcf**: um arquivo montado para isso podia parar o servidor por minutos. A leitura ficou proporcional ao tamanho do arquivo.
- **Arquivos de mídia**: o caminho de um arquivo enviado, encaminhado ou salvo como figurinha não aceita mais `..` nem caracteres que mudam o destino.
- **Figurinhas**: imagens com mais de 16 megapixels são recusadas antes de gastar o servidor.
- **Chat no site**: teto de conversas novas e de mensagens por chat (além dos limites por visitante), leitura do pedido com tamanho máximo, site sem cadeado (http) fora da lista de sites permitidos, e a conversa de um visitante cujos dados foram apagados (LGPD) não reabre.
- **Mensagem agendada**: não sai mais se quem agendou perdeu o acesso à conversa.
- **Planilha de estatística do chatbot**: texto que começa por `=`, `+`, `-` ou `@` não vira fórmula.

Também mudou de lugar: o **Chat da equipe** saiu do menu lateral (que estava cheio) e virou um botão no topo, ao lado do sino, com o número de mensagens não lidas.

Nada a fazer na atualização.
