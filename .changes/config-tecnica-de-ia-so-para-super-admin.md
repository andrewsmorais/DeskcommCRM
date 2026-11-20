---
impacto: capacidade_nova
secao: alterado
titulo: Empresa de IA, modelo, chave e freios do agente ficam só com o super-admin
---

Na tela do agente, os cartões "A inteligência que ele usa" e "Freios de segurança" (e a escolha de modelo do papel de organizar) só aparecem para o super-admin da plataforma. Para os demais, o agente usa o provedor e o modelo da plataforma (`PLATAFORMA_IA_PROVEDOR`, padrão `openai`; `PLATAFORMA_IA_MODELO`, padrão `gpt-5.4-nano`) com a chave da instalação, e o servidor ignora esses campos vindos de quem não é super-admin. Sem a chave do provedor no `.env`, o cliente vê "A inteligência artificial ainda não está pronta nesta conta".
