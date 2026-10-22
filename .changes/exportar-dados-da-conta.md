---
impacto: capacidade_nova
secao: adicionado
titulo: Exportar todos os dados da conta e avisos por e-mail depois do encerramento
---

Em Configurações › Organização há o botão "Baixar meus dados": gera um ZIP com planilhas (contatos, conversas, mensagens, funis, etapas, leads, histórico, tarefas e agendamentos) e um LEIA-ME. O link é assinado, vale por tempo limitado e não depende de a conta estar ativa.

Quando o acesso de uma conta termina, os administradores recebem três e-mails com o link de download: no encerramento, 7 dias antes do fim do prazo de 30 dias e no último dia. Roda no cron diário `exportacao-avisos` (precisa de e-mail configurado; sem ele nada é enviado nem marcado como enviado). Nada é apagado por esta versão.
