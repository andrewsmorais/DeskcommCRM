---
impacto: nada_mudou
secao: corrigido
titulo: Segurança — filtro de etiqueta e endereço de contato inválido não derrubam mais a rota
---

O teste de entradas estranhas (schemathesis) achou mais dois jeitos de a lista e a edição de contatos responderem "erro interno" (500):

- filtrar contatos por uma etiqueta com aspas, vírgula ou chave: o filtro agora protege o texto da etiqueta;
- pedir um contato por um endereço que não é um identificador válido: agora a resposta é "não encontrado" (404).

Nada a fazer na atualização.
