---
impacto: capacidade_nova
secao: adicionado
titulo: E-mails de boas-vindas, de plano e de reembolso
---

O CRM passa a escrever para quem acabou de entrar: um e-mail de boas-vindas ao criar a conta, um de agradecimento ao contratar um plano (com o que ele libera), um quando o plano sobe ou desce, um quando o Escala é ativado (com os números da proposta e os contatos de suporte) e um quando o reembolso é confirmado. Cada um sai uma vez só, mesmo se o evento chegar repetido. Precisa de `RESEND_API_KEY` e `RESEND_FROM_EMAIL`; sem eles nada é enviado e nada quebra. O WhatsApp de suporte do e-mail do Escala vem da configuração nova `SUPPORT_WHATSAPP` (vazia = não aparece), ao lado de `SUPPORT_EMAIL`.
