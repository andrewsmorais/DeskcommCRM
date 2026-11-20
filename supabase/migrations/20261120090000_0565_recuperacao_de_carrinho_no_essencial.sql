-- 0565 — recuperação de carrinho e Pix das lojas no card do Essencial.
--
-- Decisão do dono, 20/11/2026: os avisos de loja e de plataforma de venda
-- (Shopify, Yampi, WooCommerce, CartPanda, Wix, Kiwify, Hotmart, Cakto) valem
-- em TODOS os planos — receber o aviso não custa nada. O código decide pelo
-- recurso `lojas` (lib/billing/catalogo.ts, desde o Essencial); esta linha só
-- põe a frase no card do Essencial, igual à página de vendas
-- (`src/lib/oferta.ts` do repositório da página). Idempotente.

update public.plans set
  features = '["2 números de WhatsApp","1 agente de IA","1 chatbot","CRM com 2 funis","Agendamento pela IA e pelo chatbot","Agenda com Google Meet e aviso no seu WhatsApp","Chatbot completo com modelos prontos","Recuperação de carrinho e Pix das lojas (Shopify, Yampi, Kiwify…)","Respostas rápidas com foto e áudio","Caixa de entrada compartilhada e chat da equipe","Radar de conversas e painel ao vivo","Base de conhecimento para a IA","IA que entende áudio e foto","IA passa a conversa para o atendente","Chat no site e aplicativo no celular","Relatórios essenciais"]'::jsonb
where slug = 'essencial';
