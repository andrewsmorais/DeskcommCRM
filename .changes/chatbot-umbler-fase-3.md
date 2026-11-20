---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — modos de transferência, formato da resposta, prazo, link de pagamento, botões e biblioteca de mídia
---

O editor de chatbot ganha o que a Umbler documenta e o nosso ainda não tinha, sem mudança de banco:

- **Transferir p/ atendente** com quatro modos: um atendente fixo, rodízio, quem tem menos conversas abertas, ou quem atendeu o contato antes. Rodízio e menos conversas só entregam a quem está disponível; sem ninguém para receber, a conversa vai para a fila da equipe com nota explicando.
- **Pedir para digitar** confere o formato da resposta (e-mail, telefone, CPF, CNPJ com dígito verificador, número, data), pede de novo e segue por "Não respondeu certo" depois das tentativas. Pode usar a mensagem que o contato acabou de mandar, sem fazer a pergunta. O Enviar formulário também aceita CPF e CNPJ.
- **Prazo de resposta** nas perguntas, no Enviar formulário (vale para cada pergunta) e no Agendar/Reagendar horário (conta a partir da lista de horários): "Se o contato não responder" em até 7 dias, com a saída "Não respondeu a tempo", no mesmo relógio persistente do Aguardar.
- **Enviar link de pagamento**: o que é, valor, link (aceita `{{link_checkout}}`) e Pix copia e cola numa mensagem só dele. Não gera cobrança nem confere pagamento.
- **Botões e lista** no Pedir para escolher e no Agendar horário quando o número é da API oficial da Meta (até 3 opções curtas viram botões; até 10, lista). Em número por QR Code as opções seguem numeradas, porque o WhatsApp não mostra botão ali.
- **Etiqueta de origem** no Iniciar por um canal: frase da primeira mensagem vira etiqueta do contato.
- **Hotmart** no aviso de venda (webhook de compras 2.0.0, autenticado pelo `X-HOTMART-HOTTOK`), ao lado de Kiwify e Cakto: compra aprovada, Pix ou boleto gerado, cancelada, reembolso, chargeback e o evento novo **pagamento expirado**. O Pix copia e cola da compra pendente chega como `{{pix_copia_e_cola}}`.
- **Modelo pronto "Recuperar Pix ou carrinho"** nas ideias de bot: espera 15 minutos, manda o link e o Pix, pergunta se conseguiu e separa quem pagou, quem teve problema e quem desistiu. Liga numa automação "Iniciar chatbot".
- **Seis cards novos**: Enviar produto (lido no Catálogo na hora, com foto e preço atuais), Enviar localização (endereço com link do mapa), Enviar contato (cartão), condição Etapa do funil, Reagendar horário e Cancelar agendamento (os dois pelo mesmo caminho da Agenda da tela).
- **Modelos prontos**: agora são 19, entre eles qualificação comercial, apresentação de produtos, confirmação de agendamento, reagendamento, pós-venda e recuperação de oportunidade parada.
- **Copiar e colar passos** (Ctrl+C / Ctrl+V), inclusive de um fluxo para outro, e **salvar automático** com o fluxo desligado. Com o fluxo ligado, as mudanças só valem quando você salva.
- **Feriados no Horários**: os feriados nacionais (a Sexta-feira Santa é calculada a cada ano), Carnaval e Corpus Christi se você quiser, e os dias em que a empresa fecha (25/12 vale todo ano; 24/12/2026, só aquele dia) contam como fora do horário o dia inteiro.
- **Hora** como formato no Pedir para digitar e no Enviar formulário: aceita 14, 14h, 14h30 ou "às 14:30" e guarda em hh:mm.
- **Links conferidos** no Enviar mensagem e no link de pagamento: endereço que não abre página (javascript:, data:) ou incompleto impede de ligar o fluxo; link com http:// mostra um aviso para trocar por https://.
- **Aguardar até numa data**: um dia que você escolhe ou a data que o contato respondeu (ou o horário marcado pelo Agendar horário), no próprio dia ou alguns dias antes ou depois — "1 dia antes, às 9h" é o lembrete da véspera. Data passada, vazia ou fora do formato segue por "Sem data válida".
- **Follow-up pelo chatbot em todos os planos**: a seção Follow-ups no fim da lista de passos traz o card Iniciar follow-up e um atalho para cada follow-up. No plano Essencial, a tela de Follow-ups abre com um aviso e o follow-up funciona só pelo chatbot: começa à mão e usa mensagem de texto ou modelo, espera de tempo fixo e tarefa. O agente de IA, as automações, os gatilhos automáticos e os modelos prontos continuam do Impulso.
- **Iniciar follow-up** lista todos os follow-ups da empresa: os publicados para escolher, e os em rascunho ou desligados apagados, com o motivo. Se o follow-up escolhido não puder receber o contato (não publicado, ou o contato já está em outro), a conversa ganha uma nota dizendo isso.
- **Guardar em variável**, card novo: guarda um texto fixo ou montado com outras {{variaveis}} para usar depois na mensagem, no Valor ou no WebHook.
- **Enviar oferta**, card novo: a promoção vai com a linha "Válida até" (ou com {{validade}} onde você escrever); depois da data, nada é enviado e o fluxo segue por "Oferta vencida".
- **Biblioteca de mídia** no Enviar mídia: reusar um arquivo que outro chatbot da empresa já manda, e ouvir o áudio antes de salvar.

Fluxos salvos antes continuam iguais.
