/**
 * Passos do chatbot que só existem a partir do Impulso ("Chatbot avançado").
 * Client-safe: a paleta do editor importa daqui para marcar o passo antes de o
 * cliente tentar; quem barra de verdade é o servidor (`lib/chatbot/plano.ts`).
 */
export const PASSOS_AVANCADOS: ReadonlySet<string> = new Set([
  "inicio_automacao",
  "webhook",
  "definir_condicao",
  // O card da Umbler tem o diamante: avançado, como o "Definir condição".
  "condicao_campo_contato",
  "multi_condicional",
  "contato_ativo",
  "tem_etiqueta",
  "primeira_conversa",
  "canal_da_conversa",
  "atendente_da_conversa",
  "presenca_do_atendente",
  "bot_paralelo",
  "status_da_conversa",
  "aguardar_intervalo",
  "aguardar_ate",
  "distribuir_fluxo",
  "bloquear_contato",
  "excluir_contato",
  "acionar_fluxo",
  // "iniciar_followup" saiu em 03/11/2026: decisão do dono, os follow-ups ficam
  // no chatbot de TODOS os planos (o follow-up em si não é recurso de plano).
  // Os que a Umbler marca com o diamante (plano pago) entre os que entraram em
  // 03/11/2026. "Transferir p/ agentes de IA" e "Enviar template" ficam no básico.
  "valor",
  // Par do "Valor": guarda o que ele compara.
  "guardar_valor",
  "enviar_formulario",
  "fluxo_de_espera",
  "privar_liberar",
  "setor_da_conversa",
  // Condição do funil, como as outras condições do avançado.
  "etapa_do_funil",
]);
