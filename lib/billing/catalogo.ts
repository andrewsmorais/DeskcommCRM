/**
 * Contrato de recursos da oferta ChatAI Online — a MESMA promessa dos cards da
 * página de vendas (repositório andrewsmorais/Qwen). Preços vêm da tabela
 * `plans`; limites e recursos vêm DAQUI, e o CRM libera exatamente isto.
 *
 * Oferta de 27/10/2026 (preço por plano, não por atendente):
 *   - Essencial: 2 números, 1 agente, 1 chatbot, 2 funis, 2 usuários.
 *   - Impulso:   4 números, 2 agentes, 2 chatbots, 4 funis, 4 usuários.
 *   - Escala:    a partir de 6 números, 3 agentes, 3 chatbots, 6 funis,
 *     6 usuários. Não passa pelo checkout: o dono da plataforma ativa depois
 *     da conversa e pode subir esses números por organização
 *     (`subscriptions.limites_personalizados`, migration 0492).
 *
 * A regra de quantidade é "um número para cada agente ou chatbot, e um funil
 * para cada número". Campanhas só existem com o módulo `disparo_em_massa`
 * ligado na instalação (`lib/instalacao/disparo-em-massa.ts`), que vem desligado.
 */
export const RECURSOS_DO_PLANO = {
  campanhas: { nome: "Campanhas em massa", desde: "impulso" },
  agendamentos: { nome: "Agendamentos", desde: "essencial" },
  chatbot_avancado: {
    nome: "Chatbot avançado (webhook, condições, aguardar, outro fluxo)",
    desde: "impulso",
  },
  follow_up: { nome: "Follow-up automático", desde: "impulso" },
  organizar_crm: { nome: "Agente que organiza o CRM sozinho", desde: "impulso" },
  comandas_e_propostas: { nome: "Comandas e propostas", desde: "impulso" },
  processos: { nome: "Processos avançados para agentes de IA", desde: "impulso" },
  skills: { nome: "Skills para IA", desde: "impulso" },
  distribuicao_automatica: { nome: "Distribuição automática de leads", desde: "impulso" },
  api: { nome: "API", desde: "impulso" },
  webhooks: { nome: "Webhooks", desde: "impulso" },
  relatorios_completos: { nome: "Relatórios completos", desde: "impulso" },
  distribuicao_avancada: { nome: "Distribuição por número e por time", desde: "escala" },
  permissoes_avancadas: { nome: "Permissões avançadas", desde: "escala" },
  auditoria: { nome: "Logs e auditoria", desde: "escala" },
  integracoes_avancadas: { nome: "Integrações avançadas para IA", desde: "escala" },
  multimarca: { nome: "Marca própria", desde: "escala" },
} as const;

export type RecursoDoPlano = keyof typeof RECURSOS_DO_PLANO;

/** Quantidades que o CRM conta e barra. -1 = sem limite. */
export type LimiteDoPlano = "whatsapp" | "pipelines" | "agentes_ia" | "chatbots" | "usuarios";

export const PLANOS_COMERCIAIS = {
  essencial: {
    nome: "Essencial",
    ordem: 0,
    whatsapp: 2,
    pipelines: 2,
    agentes_ia: 1,
    chatbots: 1,
    usuarios: 2,
  },
  impulso: {
    nome: "Impulso",
    ordem: 1,
    whatsapp: 4,
    pipelines: 4,
    agentes_ia: 2,
    chatbots: 2,
    usuarios: 4,
  },
  escala: {
    nome: "Escala",
    ordem: 2,
    whatsapp: 6,
    pipelines: 6,
    agentes_ia: 3,
    chatbots: 3,
    usuarios: 6,
  },
} as const satisfies Record<
  string,
  { nome: string; ordem: number } & Record<LimiteDoPlano, number>
>;
export type PlanoComercial = keyof typeof PLANOS_COMERCIAIS;

export const LIMITES_DO_PLANO: readonly LimiteDoPlano[] = [
  "whatsapp",
  "pipelines",
  "agentes_ia",
  "chatbots",
  "usuarios",
];

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

/**
 * Os limites efetivos de uma organização: os do plano e, SÓ no Escala, os
 * números da proposta que o dono da plataforma gravou. A proposta nunca fica
 * abaixo do pacote base do Escala — "a partir de" é promessa da página.
 * Valor inválido na proposta é ignorado (vale o do plano), nunca vira -1.
 */
export function limitesEfetivos(
  plano: PlanoComercial,
  personalizados: unknown,
): Record<LimiteDoPlano, number> {
  const base = PLANOS_COMERCIAIS[plano];
  const efetivos = {} as Record<LimiteDoPlano, number>;
  const extra =
    plano === "escala" &&
    personalizados !== null &&
    typeof personalizados === "object" &&
    !Array.isArray(personalizados)
      ? (personalizados as Record<string, unknown>)
      : {};
  for (const chave of LIMITES_DO_PLANO) {
    const v = extra[chave];
    efetivos[chave] =
      typeof v === "number" && Number.isInteger(v) && v >= base[chave] && v <= 1000
        ? v
        : base[chave];
  }
  return efetivos;
}
