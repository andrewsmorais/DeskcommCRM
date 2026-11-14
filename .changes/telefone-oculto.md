---
impacto: capacidade_nova
secao: adicionado
titulo: Telefone oculto — esconder o número dos contatos de alguns atendentes
---

Como o "Ocultar número de telefone" da Umbler Talk: em **Equipe › Atendimento**, a coluna **"Telefone dos contatos"** marca, por atendente, se ele vê o número (**Visível**) ou não (**Oculto**). Gerente e administrador veem sempre.

- Para quem está "Oculto", todo número de contato aparece mascarado — `+55•••••••••88` — na conversa, na lista de contatos, no funil, na agenda e no histórico baixado. O código do país e os dois últimos dígitos ficam, para reconhecer o contato.
- No cadastro do contato, o campo do telefone fica só de leitura para ele (o número verdadeiro nunca é trocado pelo mascarado).
- Limite conhecido: a conexão do tempo real usa um acesso ao banco que fica no navegador; uma pessoa com conhecimento técnico conseguiria, com ele, ler o número direto do banco. A tela e todas as rotas do sistema mascaram.

Nada a fazer na atualização: o `update.sh` cria a coluna nova (migration 0517), e ninguém começa oculto.
