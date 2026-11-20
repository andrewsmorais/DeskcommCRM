---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — Enviar mídia, Agendar horário, Negócio no funil, Acionar outro fluxo, mensagem de espera e Testar
---

Quatro passos novos no editor de chatbot e duas melhorias, todos sem IA e sem mudança de banco:

- **Enviar mídia**: foto, vídeo, áudio ou documento (até 16 MB) com legenda. O arquivo é subido pela tela para o Storage da organização e, no envio, copiado para a pasta da conversa — a conversa mostra o arquivo e a LGPD o apaga junto com ela. O envio só aceita arquivo que a própria organização subiu.
- **Agendar horário**: oferece os próximos horários livres de um tipo de atendimento da Agenda (os mesmos que a tela da Agenda e o agente de IA veem: jornada, folgas, compromissos e agenda do Google), numerados; o contato responde com o número e o compromisso é marcado pelo mesmo caminho da Agenda, com chave de idempotência. Saídas "Marcou", "Sem horário livre" e "Não escolheu". Horário pego na última hora oferece a lista de novo; atendimento que a equipe aprova diz que o horário foi reservado, não confirmado. `{{horario}}` fica disponível nas mensagens seguintes.
- **Negócio no funil**: cria o negócio do contato numa etapa, ou move o que ele já tem — pela mesma regra da automação "Criar ou mover negócio" (que saiu para `lib/leads/levar-ao-funil.ts`): nunca dois negócios abertos para o mesmo contato.
- **Acionar outro fluxo**: encerra o fluxo e começa outro (ou volta ao início deste, para "voltar ao menu"), levando as respostas guardadas. No máximo 3 saltos por mensagem.
- **Mensagem de espera** nos passos de transferir (o "fluxo de espera" da Umbler): se ninguém da equipe responder em X minutos, o chatbot manda uma mensagem ao contato, até 3 vezes. Para assim que uma pessoa responde (pelo CRM ou pelo celular) ou a conversa fecha.
- **Testar**: botão no editor que abre um chat de mentira ao lado do desenho e roda o mesmo motor do WhatsApp com o desenho da tela, mesmo sem salvar — nada é enviado nem gravado. WebHook, horários da Agenda e outro fluxo são imitados, e a tela avisa.
