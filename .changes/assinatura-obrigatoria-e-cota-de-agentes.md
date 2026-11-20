---
impacto: capacidade_nova
secao: alterado
titulo: Camada comercial opcional — assinatura obrigatória e cota de agentes de IA por plano
---

Com `EXIGIR_ASSINATURA=true` (desligado por padrão — quem não vende planos não precisa fazer nada), organização sem assinatura, com o teste de 7 dias vencido ou com pagamento atrasado passa a ver só a tela `/assinatura` (escolher plano, cobrança, exportar os dados e a própria conta), e o agente deixa de responder no WhatsApp antes de chamar qualquer modelo. O super-admin e a sessão de suporte passam. A mesma chave liga os bloqueios por plano que já existiam (recursos, WhatsApp, funis e atendentes); desligada, nenhum deles se aplica. Criar ou duplicar agente de IA respeita a cota do plano: Essencial 1, Impulso 3, Escala sem limite (arquivar libera a vaga). O botão "Escolher plano" leva a `PAGINA_DE_PLANOS_URL` com a organização na URL.
