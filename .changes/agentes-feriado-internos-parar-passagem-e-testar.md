---
impacto: capacidade_nova
secao: adicionado
titulo: Agentes de IA não atendem em feriado (opcional), ignoram contatos internos, passam a conversa para outro agente e o Testar vira conversa
---

- **Não atender em feriado nacional:** nova chave no horário de funcionamento do agente. Ligada, Natal, Tiradentes, Finados e os outros feriados nacionais contam como dia fechado e o agente responde no próximo dia útil. Vem desligada.
- **Contatos internos:** em Configurações › Tags, a lista "Etiquetas de contato interno". Contato com uma dessas etiquetas (equipe, sócio, família, fornecedor) não vira negócio no funil, não recebe resposta da IA nem follow-up automático. A conversa continua normal no Inbox.
- **Quem responde PARAR:** além de bloquear o contato, os negócios abertos dele são fechados como perdidos, com o motivo novo "Pediu para não receber mensagens".
- **Pedido de parar em áudio:** quando a transcrição de um áudio parece um pedido para parar, abre um aviso na Central apontando a conversa. Nada é bloqueado sozinho, porque a transcrição pode errar.
- **Passar para outro agente:** um agente de IA pode passar a conversa para outro agente da empresa (ex.: do atendimento para o financeiro). O escolhido responde até o fim daquele atendimento.
- **Testar como conversa:** o botão Testar do agente guarda a conversa: dá para mandar várias mensagens seguidas e ver como a IA lida com objeção, mudança de assunto ou volta ao preço. O painel não mostra mais o nome do modelo de IA.
- **Follow-up por etapa:** quando o negócio sai da etapa que armou um follow-up, o toque pendente é cancelado.
- **Espera só em horário comercial:** no passo de espera do follow-up, a opção "Só terminar a espera em horário comercial" (dias e horas, no fuso da empresa). Se a espera vencer de noite ou num dia fechado, o próximo toque sai na abertura seguinte. A resposta do cliente continua cortando a espera a qualquer hora.

Migrations 0522 e 0523 (aplicadas pelo `update.sh`). Trazido do produto original.
