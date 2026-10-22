---
impacto: capacidade_nova
secao: adicionado
titulo: Exportar todos os dados da conta, avisos por e-mail e exclusão no fim do prazo
---

Em Configurações › Organização há o botão "Baixar meus dados": gera um ZIP com planilhas (contatos, conversas, mensagens, funis, etapas, leads, histórico, tarefas e agendamentos) e um LEIA-ME. O link é assinado, vale por tempo limitado e não depende de a conta estar ativa.

Quando o acesso de uma conta termina, os administradores recebem três e-mails com o link de download: no encerramento, 7 dias antes do fim do prazo de 30 dias e no último dia. Roda no cron diário `exportacao-avisos` (precisa de e-mail configurado; sem ele nada é enviado nem marcado como enviado).

Terminado o prazo — 30 dias mais 2 de folga, o mesmo instante em que o link dos e-mails expira —, o cron diário `exportacao-exclusao` desconecta o WhatsApp por QR da conta e abre um pedido LGPD de anonimização da organização inteira (contatos, conversas, mensagens, mídia, leads, propostas e pedidos). Assinaturas e auditoria ficam, porque a lei manda guardar. A conta só é excluída se pelo menos um aviso deste encerramento chegou a algum administrador; sem aviso entregue, ela aparece no contador `semAviso` do cron para decisão manual. Canal oficial da Meta não é desligado por esse caminho e aparece em `canaisOficiais`. Antes de confiar no cron, confira com `?simular=1`. Exige a migration 0483.
