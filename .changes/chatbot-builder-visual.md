---
impacto: capacidade_nova
secao: adicionado
titulo: Chatbot Builder visual — fluxos automáticos sem custo de IA
---

Novo módulo "Chatbots" no menu de IA (abaixo de Agentes), com canvas drag-and-drop estilo Umbler Talk. Permite criar fluxos de atendimento automático com zero custo de token: árvore de decisão visual com nós de Mensagem, Condição, Transferir e Encerrar. Os dados do canvas são salvos automaticamente (debounce 1,5s). O chatbot pode ser ativado/desativado por um botão na própria tela do editor.

Requer role `manager` para criar e editar; `agent` para visualizar. Multi-tenancy completo com RLS. Quatro tabelas novas: `chatbot_flows`, `chatbot_nodes`, `chatbot_edges`, `chatbot_sessions` (migration 0484).
