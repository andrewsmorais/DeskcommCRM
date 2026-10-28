---
impacto: capacidade_nova
secao: adicionado
titulo: E-mails de boas-vindas, de plano e de reembolso
---

O CRM passa a escrever para quem acabou de entrar: um e-mail de boas-vindas ao criar a conta, um de agradecimento ao contratar um plano (com o que ele libera), um quando o plano sobe ou desce e um quando o reembolso é confirmado. Cada um sai uma vez só, mesmo se o evento chegar repetido. Precisa de `RESEND_API_KEY` e `RESEND_FROM_EMAIL`; sem eles nada é enviado e nada quebra.
