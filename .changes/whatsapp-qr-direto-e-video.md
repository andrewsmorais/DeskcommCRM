---
impacto: capacidade_nova
secao: alterado
titulo: O passo do WhatsApp abre direto no QR code, com vídeo opcional acima
---

No onboarding, o passo do telefone agora abre já gerando o código para ler com o celular, sem a pergunta das três formas. A API oficial da Meta e o provedor parceiro continuam a um clique, em "Escolher outra forma". Acima do código pode aparecer um vídeo curto que explica a conexão.

Duas variáveis novas no `.env`, ambas opcionais: `ONBOARDING_WHATSAPP_QR_DIRETO` (padrão `true`; `false` devolve a pergunta como primeira tela) e `ONBOARDING_WHATSAPP_VIDEO_URL` (endereço https de um .mp4/.webm ou de embed; vazio = sem vídeo).
