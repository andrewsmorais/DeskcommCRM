---
impacto: capacidade_nova
secao: adicionado
titulo: Jev — conferir os fatos da resposta e os campos que a IA grava
---

O cartão do Jev (IA › Provedores) ganhou as duas tarefas que faltavam, as duas desligadas por padrão:

- **Conferir afirmações de fato na resposta**: antes de a resposta sair, o Jev confere se o que o assistente afirma sobre o negócio ("abrimos às 8h", "temos estacionamento") está no catálogo ou na base de conhecimento consultados naquela conversa. Nesta versão ela **só observa**: nenhuma resposta é barrada, e o cartão mostra quantas teriam sido corrigidas. Sem material consultado, sem chave ou com o Jev fora do ar, nada muda.
- **Conferir o campo antes de a IA gravar**: quando o assistente preenche um campo personalizado do negócio, o Jev confere se o cliente disse aquilo na conversa. Ela começa observando; com "Deixar o Jev decidir", o que o cliente não disse não é gravado e o assistente é mandado perguntar. Telas, API e automações não passam por essa conferência.
