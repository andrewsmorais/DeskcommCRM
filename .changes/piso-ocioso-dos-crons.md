---
impacto: capacidade_nova
secao: alterado
titulo: Instalação parada consulta muito menos o banco
---

As rotinas automáticas que rodam de minuto em minuto (distribuição de conversas, mensagens presas, sonecas, devolução de atendimento, Google Agenda, reenvio de webhooks, importação de histórico, lembretes e outras) perguntavam ao banco a cada batida só para descobrir que não havia nada a fazer. Agora uma única consulta, renovada a cada 30 segundos, diz quais delas têm trabalho, e as outras encerram na hora. Numa VPS com o Supabase do plano grátis, isso economiza boa parte da cota de requisições. Se a consulta falhar, tudo roda como antes.
