---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot — "Pedir para digitar" com várias respostas aceitas e regra própria
---

O passo **Pedir para digitar** do chatbot ganhou a opção **"Aceitar várias respostas"**, como na Umbler Talk:

- Cada opção tem um nome e um formato pronto (CPF, CNPJ, e-mail, telefone, número, data, hora, qualquer texto) ou uma **regra própria** (expressão regular), e ganha **uma saída só sua** no quadro do fluxo.
- A resposta do contato segue pela **primeira opção que bate**, na ordem da lista. Se nenhuma bater, o chatbot pede de novo e, depois das tentativas, segue por "Nenhuma opção".
- **"Testar opções"** mostra, sem salvar nada, por onde uma resposta de exemplo seguiria.
- A regra própria tem uma trava: no máximo 200 caracteres, testada nos 100 primeiros caracteres da mensagem, e o editor recusa as regras que poderiam travar o atendimento (por exemplo, um grupo repetido que já tem repetição dentro). O fluxo não liga com uma regra assim.

Fluxos que já existiam continuam iguais (um formato só por pergunta).
