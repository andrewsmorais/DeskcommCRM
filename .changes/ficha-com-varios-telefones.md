---
impacto: capacidade_nova
secao: adicionado
titulo: A ficha do contato guarda vários telefones
---

Na ficha do contato, a seção **Telefones** agora aceita mais de um número: dá para adicionar, editar (tipo fixo/celular, se tem WhatsApp, rótulo como "Trabalho"), remover e **tornar principal** um telefone. Quem pode é o atendente para cima.

O que muda no dia a dia:

- **Mensagem do segundo número cai na mesma ficha.** Antes, quem escrevia de outro número virava um contato novo.
- **A resposta volta pelo número que a pessoa usou** (no WhatsApp por QR). O cabeçalho da conversa mostra "A resposta sai por: …" quando a ficha tem mais de um número.
- **Juntar fichas não perde mais o segundo número:** ele fica guardado como telefone extra.
- **A busca acha a ficha pelo número extra** (contatos, conversas, fila de follow-up), e a prospecção não aborda empresa cujo número já é extra de alguém.
- **LGPD:** o pedido de dados inclui os números extras, e a anonimização apaga todos eles.
- Um número só pode estar em uma ficha da empresa: o banco recusa repetir.

Exige aplicar a atualização do banco (migration 0541), que o `update.sh` já faz.
