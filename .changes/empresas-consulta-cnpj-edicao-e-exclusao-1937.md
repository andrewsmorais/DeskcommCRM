---
impacto: capacidade_nova
secao: adicionado
titulo: Empresas ganham consulta de CNPJ antes de criar, edição e exclusão na tela, e o CNPJ mantém a máscara quando o enriquecimento falha
---

No cadastro de uma empresa nova, o botão "Consultar CNPJ" busca os dados públicos na BrasilAPI e preenche o formulário para revisão antes de criar. Nada é gravado na consulta, e a tela avisa quando o CNPJ já existe na organização. Quando a BrasilAPI recusa a consulta (403) ou está fora do ar, a tela diz que é indisponibilidade e sugere tentar de novo, em vez de dizer que o CNPJ não existe. A consulta exige o papel de gestor, o mesmo da criação.

A tela de detalhe da empresa passa a permitir editar o cadastro e excluir a empresa. Excluir exige o papel de gestor e fica registrado na auditoria. Se houver pessoas vinculadas à empresa, a exclusão é recusada e a tela mostra quantas são.

O CNPJ deixa de perder a máscara (aparecia `33547054000120` no lugar de `33.547.054/0001-20`) quando o enriquecimento automático falha.

Nada é preciso fazer na instalação.

Contribuição de @webtecnica (#2273), a partir da issue #1937 de @Fabricio-Point-Machine.
