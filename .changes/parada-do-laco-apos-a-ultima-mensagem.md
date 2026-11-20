---
impacto: capacidade_nova
secao: alterado
titulo: O agente encerra o atendimento sem a chamada extra à IA depois da última mensagem
---

Depois de responder ao cliente, o agente chamava a IA mais uma vez só para ela dizer "terminei" — uma chamada inteira que não produzia nada e custava tokens. Agora, quando a própria IA marca a mensagem como a última do turno e ela não promete nada que ainda falta fazer (chamar alguém da equipe, agendar um retorno, conferir a agenda), o atendimento termina ali. Se a mensagem promete uma dessas ações, a IA continua até cumpri-la, como antes. Vale só para resposta a mensagem do cliente. Para voltar ao comportamento antigo, use `AGENT_STOP_AFTER_FINAL_SEND=off` no `.env`.
