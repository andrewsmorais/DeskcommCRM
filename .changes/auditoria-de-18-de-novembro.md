---
impacto: nada_mudou
secao: corrigido
titulo: Segurança — correções da auditoria de 18/11 (atualização do sistema, mídia, agenda, conversas e planilhas)
---

Uma auditoria de segurança releu o que entrou desde a de 14/11. O que apareceu de mais grave foi corrigido:

- **Mídia recebida pelo WhatsApp**: o endereço de um arquivo que chegava pelo WAHA era seguido sem conferência; agora só se busca no armazém de arquivos da própria sessão do WAHA, e o arquivo é servido de volta sem poder rodar como página.
- **Atualização do sistema (Configurações › Sistema)**: pedir atualização agora exige o dono do servidor com acesso completo (o acesso "somente leitura" de suporte não pede mais) e, quando há verificação em duas etapas, a sessão que a provou.
- **Agente de atualização da VPS**: ele só instala a versão publicada que ele mesmo consultou, e só volta para a versão de onde a instalação veio. Antes, um pedido vindo do app podia escolher qualquer versão antiga, inclusive uma que nunca foi publicada.
- **Avisos de agendamento**: só quem pode mexer na agenda gera o aviso, e só de mudança que aconteceu — um "cancelado" de horário que continua de pé é recusado, e a mesma mudança não sai duas vezes (migration 0554).
- **Conversa privada**: quem foi chamado para ajudar numa conversa privada lê e responde, mas não fecha, não transfere e não muda o setor dela (migration 0555).
- **IA e setor**: a IA só muda o setor da conversa que ela está atendendo naquele momento.
- **Importar planilha (.xlsx) na prospecção e no import de empresas**: um arquivo montado para isso podia travar ou derrubar o servidor de todas as empresas. A leitura ficou proporcional ao tamanho do arquivo, com teto no que é descompactado e na largura das linhas.
- **Contato "pessoal" e "sempre atendimento humano"**: as duas marcas só mudam pela rota própria (um atendente não consegue mais desligá-las direto no banco); nenhum envio que não seja de uma pessoa sai para esses contatos (IA, automação, chatbot, token de servidor e campanha); ao juntar duas fichas a marca da que sai passa para a que fica; e tirar o número ou apagar uma ficha marcada passa a exigir gerente (migrations 0556 e 0557).
- **Recusa de marketing**: a recusa gravada pela ficha do contato também vale para automações e campanhas, como já valia na prospecção.
- **Telefone da ficha**: só quem vê todas as conversas da ficha acrescenta ou troca o telefone dela; e a resposta só segue por `@lid` enquanto ele ainda estiver ligado à ficha.
- **Exportar contatos e auditoria em CSV**: texto que começa com `=`, `+`, `-` ou `@` sai como texto, e não como fórmula da planilha.
- **Mídia e LGPD**: se a mensagem é anonimizada enquanto a foto está sendo guardada, a foto não volta e o arquivo é apagado.
- **Avisos de agendamento**: o histórico (que guarda o telefone do dono) só é lido por administrador.
- **Importar contatos**: um e-mail gigante numa célula podia travar o servidor por minutos; e-mail com mais de 254 caracteres é recusado antes da conferência.

Nada a fazer na atualização. As migrations 0554 a 0557 entram sozinhas pelo `update.sh`. Na primeira volta de versão depois desta atualização, o agente descobre de onde a instalação veio pelo histórico do git; a partir da seguinte, pelo arquivo que o `update.sh` passa a gravar.
