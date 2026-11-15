/**
 * Limites do histórico do Testar como conversa. Módulo à parte, sem dependência
 * nenhuma, porque o painel (cliente) e a rota (servidor) usam os MESMOS números:
 * o painel recorta a conversa para caber, e a rota recusa o corpo que passar.
 */
export const LIMITE_DO_HISTORICO_EM_MENSAGENS = 30;
export const LIMITE_DO_HISTORICO_EM_CARACTERES = 20_000;
