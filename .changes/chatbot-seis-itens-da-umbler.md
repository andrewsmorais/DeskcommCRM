---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — quem fechou, agenda avançada, caminho se falhar, fluxo em paralelo e chave do WebHook em outro cabeçalho
---

Cinco coisas que a Umbler Talk tem e faltavam no editor de chatbot:

- **Finalizar conversa** escolhe quem aparece como quem fechou: o chatbot ou o atendente responsável.
- **Aguardar até** aceita uma **agenda avançada** (dia do mês, mês, vários horários), com exemplos prontos e a leitura em português.
- **Enviar mensagem** e **Transferir para a equipe** ganharam a opção **"Seguir outro caminho se falhar"**: o passo ganha uma saída a mais para quando a mensagem não sai ou o setor não existe.
- **Acionar outro fluxo** pode **abrir em paralelo**: o outro fluxo começa e este continua.
- No passo **WebHook**, a chave da API agora pode ir no cabeçalho que a API pedir (Authorization, access_token ou x-api-token), e os dados do contato entram como `{{contato_nome}}`, `{{contato_telefone}}` e `{{contato_email}}`.

Nada a fazer na atualização. Os fluxos que já existem continuam iguais: tudo isso vem desligado.
