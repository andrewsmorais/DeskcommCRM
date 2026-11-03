---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — modos de transferência, formato da resposta, prazo, link de pagamento, botões e biblioteca de mídia
---

O editor de chatbot ganha o que a Umbler documenta e o nosso ainda não tinha, sem mudança de banco:

- **Transferir p/ atendente** com quatro modos: um atendente fixo, rodízio, quem tem menos conversas abertas, ou quem atendeu o contato antes. Rodízio e menos conversas só entregam a quem está disponível; sem ninguém para receber, a conversa vai para a fila da equipe com nota explicando.
- **Pedir para digitar** confere o formato da resposta (e-mail, telefone, CPF, CNPJ com dígito verificador, número, data), pede de novo e segue por "Não respondeu certo" depois das tentativas. Pode usar a mensagem que o contato acabou de mandar, sem fazer a pergunta. O Enviar formulário também aceita CPF e CNPJ.
- **Prazo de resposta** nas perguntas: "Se o contato não responder" em até 7 dias, com a saída "Não respondeu a tempo", no mesmo relógio persistente do Aguardar.
- **Enviar link de pagamento**: o que é, valor, link (aceita `{{link_checkout}}`) e Pix copia e cola numa mensagem só dele. Não gera cobrança nem confere pagamento.
- **Botões e lista** no Pedir para escolher e no Agendar horário quando o número é da API oficial da Meta (até 3 opções curtas viram botões; até 10, lista). Em número por QR Code as opções seguem numeradas, porque o WhatsApp não mostra botão ali.
- **Etiqueta de origem** no Iniciar por um canal: frase da primeira mensagem vira etiqueta do contato.
- **Biblioteca de mídia** no Enviar mídia: reusar um arquivo que outro chatbot da empresa já manda, e ouvir o áudio antes de salvar.

Fluxos salvos antes continuam iguais.
