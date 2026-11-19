/**
 * Contrato de recursos da oferta ChatAI Online — a MESMA promessa dos cards da
 * página de vendas (repositório andrewsmorais/Qwen, `src/lib/oferta.ts`) e da
 * coluna `plans.features`. Preços vêm da tabela `plans`; limites e recursos vêm
 * DAQUI, e o CRM libera exatamente isto.
 *
 * Oferta de 19/11/2026 (preço por plano, não por atendente). Os TRÊS planos se
 * contratam pelo checkout, com 7 dias grátis, e liberam sozinhos o que o card
 * promete — o Escala deixou de ser "sob consulta" (decisão do dono):
 *   - Essencial: 2 números, 1 agente, 1 chatbot, 2 funis, 2 usuários.
 *   - Impulso:   4 números, 2 agentes, 2 chatbots, 4 funis, 4 usuários.
 *   - Escala:    6 números, 3 agentes, 3 chatbots, 6 funis, 6 usuários. O dono
 *     da plataforma ainda pode SUBIR esses números para uma organização
 *     (`subscriptions.limites_personalizados`, migration 0492), nunca baixar.
 *
 * A regra de quantidade é "um número para cada agente ou chatbot, e um funil
 * para cada número". Campanhas só existem com o módulo `disparo_em_massa`
 * ligado na instalação (`lib/instalacao/disparo-em-massa.ts`), que vem desligado.
 *
 * O que GASTA dinheiro de fora (busca paga, minuto de telefone, voz sintetizada)
 * não entra em plano nenhum: é EXTRA cobrado à parte, ligado por organização
 * pelo dono da plataforma (`EXTRAS_COBRADOS_A_PARTE`, `lib/billing/extras.ts`).
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
  ia_em_grupo: { nome: "IA que responde em grupos de WhatsApp", desde: "impulso" },
  automacoes_avancadas: {
    nome: "Automações com e-mail, mídia, aviso à equipe e negócio ganho ou perdido",
    desde: "impulso",
  },
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
  jev: { nome: "Segundo agente que confere as respostas da IA (Jev)", desde: "escala" },
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

/**
 * O Escala desta organização tem números ACIMA do pacote base (proposta do dono
 * da plataforma)? É o que impede a troca sozinha: a proposta tem preço próprio.
 */
export function escalaComProposta(personalizados: unknown): boolean {
  const efetivos = limitesEfetivos("escala", personalizados);
  return LIMITES_DO_PLANO.some((k) => efetivos[k] > PLANOS_COMERCIAIS.escala[k]);
}

/**
 * Extras cobrados À PARTE: nenhum plano os inclui. Cada um gasta dinheiro de
 * fora a cada uso, por isso só funcionam na organização em que o dono da
 * plataforma os ligou (`subscriptions.extras`, migration 0562).
 */
export const EXTRAS_COBRADOS_A_PARTE = {
  prospeccao: { nome: "Prospecção automática" },
  ligacoes: { nome: "Ligações por IA e Cold Call" },
  nota_de_voz: { nome: "Respostas da IA em nota de voz" },
} as const;

export type ExtraCobradoAParte = keyof typeof EXTRAS_COBRADOS_A_PARTE;

export const LISTA_DE_EXTRAS = Object.keys(EXTRAS_COBRADOS_A_PARTE) as ExtraCobradoAParte[];

export function ehExtra(v: unknown): v is ExtraCobradoAParte {
  return typeof v === "string" && Object.hasOwn(EXTRAS_COBRADOS_A_PARTE, v);
}

/** Lê a coluna `extras` com falha FECHADA: o que não for extra conhecido some. */
export function extrasLidos(v: unknown): ExtraCobradoAParte[] {
  return Array.isArray(v) ? [...new Set(v.filter(ehExtra))] : [];
}
