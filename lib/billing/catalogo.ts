/** Contrato de recursos da oferta ChatAI Online. Preços vêm do catálogo plans.
 * Mantém fluxos, agentes, conhecimento, agenda e relatórios básicos em todos os planos.
 *
 * Oferta de 22/10/2026: Essencial é o plano de entrada de UM atendente (o dono
 * do balcão), com um número de WhatsApp por QR code; Escala é para operação de
 * alto volume, mínimo de 5 atendentes, com a API oficial da Meta implantada.
 * Campanhas só existem com o módulo `disparo_em_massa` ligado na instalação
 * (`lib/instalacao/disparo-em-massa.ts`), que vem desligado.
 */
export const RECURSOS_DO_PLANO = {
  campanhas: { nome: "Campanhas em massa", desde: "impulso" },
  agendamentos: { nome: "Agendamentos", desde: "essencial" },
  processos: { nome: "Processos avançados", desde: "impulso" },
  skills: { nome: "Skills para IA", desde: "impulso" },
  distribuicao_automatica: { nome: "Distribuição automática de leads", desde: "impulso" },
  api: { nome: "API", desde: "impulso" },
  webhooks: { nome: "Webhooks", desde: "impulso" },
  relatorios_completos: { nome: "Relatórios completos", desde: "impulso" },
  distribuicao_avancada: { nome: "Distribuição avançada", desde: "escala" },
  permissoes_avancadas: { nome: "Permissões avançadas", desde: "escala" },
  auditoria: { nome: "Consulta e exportação de auditoria", desde: "escala" },
  integracoes_avancadas: { nome: "Integrações avançadas para IA", desde: "escala" },
  multimarca: { nome: "Multimarca", desde: "escala" },
} as const;

export type RecursoDoPlano = keyof typeof RECURSOS_DO_PLANO;
export const PLANOS_COMERCIAIS = {
  // `agentes_ia`: agentes de IA não arquivados que a organização pode ter (-1 = sem limite).
  essencial: {
    nome: "Essencial",
    ordem: 0,
    minimoAtendentes: 1,
    whatsapp: 1,
    pipelines: 1,
    agentes_ia: 1,
  },
  impulso: {
    nome: "Impulso",
    ordem: 1,
    minimoAtendentes: 3,
    whatsapp: 3,
    pipelines: 5,
    agentes_ia: 3,
  },
  escala: {
    nome: "Escala",
    ordem: 2,
    minimoAtendentes: 5,
    whatsapp: -1,
    pipelines: -1,
    agentes_ia: -1,
  },
} as const;
export type PlanoComercial = keyof typeof PLANOS_COMERCIAIS;

export function planoComercial(slug: string): PlanoComercial | null {
  return Object.hasOwn(PLANOS_COMERCIAIS, slug) ? (slug as PlanoComercial) : null;
}

export function planoInclui(slug: string, recurso: RecursoDoPlano): boolean {
  const plano = planoComercial(slug);
  return (
    plano !== null &&
    PLANOS_COMERCIAIS[plano].ordem >= PLANOS_COMERCIAIS[RECURSOS_DO_PLANO[recurso].desde].ordem
  );
}
