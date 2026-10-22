---
impacto: exige_acao
secao: alterado
titulo: Sem assinatura ativa, o CRM fecha e o agente para; cada plano tem cota de agentes de IA
---

Organização sem assinatura, com o teste de 7 dias vencido ou com pagamento atrasado passa a ver só a tela `/assinatura` (escolher plano, cobrança, exportar os dados e a própria conta), e o agente deixa de responder no WhatsApp antes de chamar qualquer modelo. O super-admin e a sessão de suporte passam. Instalação sem venda deve definir `EXIGIR_ASSINATURA=false`, senão toda organização sem assinatura fica bloqueada. Criar ou duplicar agente de IA respeita a cota do plano: Essencial 1, Impulso 3, Escala sem limite (arquivar libera a vaga). O botão "Escolher plano" leva a `PAGINA_DE_PLANOS_URL` com a organização na URL.
