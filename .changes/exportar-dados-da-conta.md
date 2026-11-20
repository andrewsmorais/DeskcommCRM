---
impacto: capacidade_nova
secao: adicionado
titulo: Exportar todos os dados da conta, avisos por e-mail e exclusão no fim do prazo
---

Em Configurações › Organização há o botão "Baixar meus dados": gera um ZIP com planilhas (contatos, conversas, mensagens, funis, etapas, leads, histórico, tarefas e agendamentos) e um LEIA-ME. O link é assinado, vale por tempo limitado e não depende de a conta estar ativa.

Quando o acesso de uma conta termina, os administradores recebem três e-mails com o link de download: no encerramento, 7 dias antes do fim do prazo de 30 dias e no último dia. Roda no cron diário `exportacao-avisos` (precisa de e-mail configurado; sem ele nada é enviado nem marcado como enviado). Quem já baixou os dados depois do encerramento não recebe os dois lembretes seguintes: o download só conta quando o arquivo chega inteiro, e o primeiro e-mail, que anuncia a data da exclusão, sai sempre.

Terminado o prazo — 30 dias mais 2 de folga, o mesmo instante em que o link dos e-mails expira —, o cron diário `exportacao-exclusao` desliga todos os canais da conta e abre um pedido LGPD de anonimização da organização inteira (contatos, conversas, mensagens, mídia, leads, propostas e pedidos). Assinaturas e auditoria ficam, porque a lei manda guardar. A conta só é excluída se pelo menos um aviso deste encerramento chegou a algum administrador; sem aviso entregue, ela aparece no contador `semAviso` do cron para decisão manual. O WhatsApp por QR sai do WAHA. O canal oficial da Meta sai pelo mesmo procedimento da tela: pede à Meta que devolva o número, apaga a credencial, troca a URL do webhook e arquiva. Se a Meta recusar a devolução, nada entra mesmo assim, e o caso aparece em `webhooksDaMetaPendentes` para desfazer no app da Meta. Antes de confiar no cron, confira com `?simular=1`. Exige a migration 0483.
