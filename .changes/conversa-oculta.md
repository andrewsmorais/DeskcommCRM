---
impacto: capacidade_nova
secao: adicionado
titulo: Ocultar conversa e o bloco "Visibilidade da conversa" do chatbot
---

Uma conversa pode ser **ocultada** sem ser fechada, como na Umbler Talk: ela sai das abas da tela de Conversas (e da contagem delas) e aparece no novo filtro **Ocultas**, ao lado de "Não lidos" e "Grupos". Nada é apagado: histórico, responsável e funil continuam iguais.

- No topo da conversa, o **olho** oferece: mostrar na caixa de entrada, ocultar, ou ocultar **até a próxima mensagem do contato** — nesse caso a conversa volta sozinha quando o cliente escrever.
- O chatbot ganha o bloco **Visibilidade da conversa** (Visível, Oculta, Oculta até a próxima mensagem do contato), no chatbot avançado (Impulso e Escala). Por exemplo: depois de resolver o pedido, o fluxo tira a conversa da frente da equipe sem finalizá-la.
- Toda mudança fica na auditoria (`conversation.visibility_changed`).

A API `GET /api/v1/conversations` passa a esconder as ocultas por padrão, como a tela; `?ocultas=so` lista só elas e `?ocultas=incluir` lista todas. As ferramentas do MCP continuam vendo a lista inteira.

Nada a fazer na atualização: o `update.sh` cria a coluna nova.
