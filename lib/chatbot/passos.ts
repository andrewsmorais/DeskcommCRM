/**
 * Catálogo dos passos do Chatbot Builder — a lista ÚNICA que a tela (menu do
 * "+", nó no quadro, painel de configuração) e o motor (lib/chatbot/motor.ts)
 * leem. Passo que não está aqui não existe: nem aparece no menu, nem roda.
 *
 * O chatbot não usa IA em ponto nenhum, nem para entregar a conversa a um
 * agente de IA (decisão do dono do produto, 22/10/2026): é fluxo puro, sem
 * custo de token.
 *
 * Inspirado no editor da Umbler Talk (grupos Início, Condição, Ação,
 * Finalização, Utilitários). Fase 1: os passos abaixo. Os demais da Umbler
 * entram por fase, sempre com motor junto.
 */
import { z } from "zod";

export const GRUPOS_DE_PASSO = [
  { id: "inicio", nome: "Início" },
  { id: "condicao", nome: "Condição" },
  { id: "acao", nome: "Ação" },
  { id: "finalizacao", nome: "Finalização" },
  { id: "utilitarios", nome: "Utilitários" },
] as const;
export type GrupoDePasso = (typeof GRUPOS_DE_PASSO)[number]["id"];

const HORA = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato 08:30.");

export const configDoPasso = {
  inicio_canal: z.object({
    /** null = qualquer número de WhatsApp da empresa. */
    channel_session_id: z.string().uuid().nullable().default(null),
    /** Começa em toda conversa nova, ou só quando a mensagem contém uma palavra. */
    gatilho: z.enum(["toda_conversa_nova", "palavra_chave"]).default("toda_conversa_nova"),
    palavras: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  }),
  enviar_mensagem: z.object({
    texto: z.string().trim().max(4000).default(""),
  }),
  pedir_escolher: z.object({
    pergunta: z.string().trim().max(2000).default(""),
    opcoes: z
      .array(z.string().trim().min(1).max(80))
      .min(1)
      .max(10)
      .default(["Opção 1", "Opção 2"]),
    mensagem_invalida: z
      .string()
      .trim()
      .max(500)
      .default("Não entendi. Responda com o número de uma das opções."),
    tentativas: z.number().int().min(1).max(5).default(3),
  }),
  pedir_digitar: z.object({
    pergunta: z.string().trim().max(2000).default(""),
    /** Onde a resposta fica guardada, para usar depois como {{nome}}. */
    variavel: z
      .string()
      .trim()
      .regex(/^[a-z_][a-z0-9_]{0,39}$/, "Use letras minúsculas, números e _.")
      .default("resposta"),
  }),
  mensagem_contem: z.object({
    palavras: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  }),
  horarios: z.object({
    faixas: z
      .array(z.object({ inicio: HORA, fim: HORA }))
      .min(1)
      .max(6)
      .default([{ inicio: "08:00", fim: "18:00" }]),
  }),
  dias_semana: z.object({
    /** 0 = domingo … 6 = sábado. */
    dias: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  }),
  /**
   * Este CRM não tem "setores" como a Umbler: a conversa vai para a fila de
   * atendimento humano e a Distribuição de atendimento escolhe quem pega.
   */
  transferir_equipe: z.object({
    mensagem: z.string().trim().max(1000).default(""),
  }),
  transferir_atendente: z.object({
    user_id: z.string().uuid().nullable().default(null),
    mensagem: z.string().trim().max(1000).default(""),
  }),
  editar_etiquetas: z.object({
    adicionar: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    remover: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  }),
  finalizar_conversa: z.object({
    mensagem: z.string().trim().max(1000).default(""),
  }),
  bloco_de_notas: z.object({
    texto: z.string().max(4000).default(""),
  }),
} as const;

export type TipoDePasso = keyof typeof configDoPasso;
export type ConfigDe<T extends TipoDePasso> = z.infer<(typeof configDoPasso)[T]>;

export type MetaDoPasso = {
  tipo: TipoDePasso;
  grupo: GrupoDePasso;
  nome: string;
  descricao: string;
  /** Nome do ícone em lucide-react. A tela resolve; o motor ignora. */
  icone: string;
  /** Cor do ícone (classe Tailwind). */
  cor: string;
  /** Recebe ligação de outro passo? (Início e Bloco de notas não.) */
  temEntrada: boolean;
};

export const PASSOS: readonly MetaDoPasso[] = [
  {
    tipo: "inicio_canal",
    grupo: "inicio",
    nome: "Iniciar por um canal",
    descricao: "Inicia quando o contato entra através de um canal.",
    icone: "MessageCircle",
    cor: "text-green-500",
    temEntrada: false,
  },
  {
    tipo: "horarios",
    grupo: "condicao",
    nome: "Horários",
    descricao: "Defina ações a partir de intervalos de horários.",
    icone: "Clock",
    cor: "text-orange-500",
    temEntrada: true,
  },
  {
    tipo: "dias_semana",
    grupo: "condicao",
    nome: "Dias da semana",
    descricao: "Defina ações a partir de cada dia da semana.",
    icone: "CalendarDays",
    cor: "text-violet-500",
    temEntrada: true,
  },
  {
    tipo: "mensagem_contem",
    grupo: "condicao",
    nome: "Mensagem contém",
    descricao: "Verifica palavras-chave da última mensagem do contato.",
    icone: "Search",
    cor: "text-red-500",
    temEntrada: true,
  },
  {
    tipo: "enviar_mensagem",
    grupo: "acao",
    nome: "Enviar mensagem",
    descricao: "Envie uma mensagem diretamente para o contato.",
    icone: "MessageSquareText",
    cor: "text-green-500",
    temEntrada: true,
  },
  {
    tipo: "pedir_escolher",
    grupo: "acao",
    nome: "Pedir para escolher",
    descricao: "Ofereça opções para o contato escolher.",
    icone: "ListChecks",
    cor: "text-teal-500",
    temEntrada: true,
  },
  {
    tipo: "pedir_digitar",
    grupo: "acao",
    nome: "Pedir para digitar",
    descricao: "Peça para o contato digitar um texto livre.",
    icone: "TextCursorInput",
    cor: "text-slate-400",
    temEntrada: true,
  },
  {
    tipo: "transferir_equipe",
    grupo: "acao",
    nome: "Transferir para a equipe",
    descricao: "Passe a conversa para a fila de atendentes humanos.",
    icone: "Users",
    cor: "text-red-400",
    temEntrada: true,
  },
  {
    tipo: "transferir_atendente",
    grupo: "acao",
    nome: "Transferir p/ atendente",
    descricao: "Transfira a conversa para um atendente específico.",
    icone: "Headset",
    cor: "text-red-400",
    temEntrada: true,
  },
  {
    tipo: "editar_etiquetas",
    grupo: "acao",
    nome: "Editar etiquetas",
    descricao: "Adicione ou remova etiquetas do contato.",
    icone: "Tag",
    cor: "text-slate-300",
    temEntrada: true,
  },
  {
    tipo: "finalizar_conversa",
    grupo: "finalizacao",
    nome: "Finalizar conversa",
    descricao: "Finaliza a conversa automaticamente.",
    icone: "Check",
    cor: "text-red-500",
    temEntrada: true,
  },
  {
    tipo: "bloco_de_notas",
    grupo: "utilitarios",
    nome: "Bloco de notas",
    descricao: "Faça anotações para documentar seu fluxo.",
    icone: "StickyNote",
    cor: "text-yellow-500",
    temEntrada: false,
  },
];

export function metaDoPasso(tipo: string): MetaDoPasso | null {
  return PASSOS.find((p) => p.tipo === tipo) ?? null;
}

export function ehTipoDePasso(tipo: string): tipo is TipoDePasso {
  return Object.hasOwn(configDoPasso, tipo);
}

/** Config válida do passo, com padrões preenchidos. Config inválida volta inteira ao padrão. */
export function lerConfig<T extends TipoDePasso>(tipo: T, dados: unknown): ConfigDe<T> {
  const schema = configDoPasso[tipo] as unknown as z.ZodType<ConfigDe<T>>;
  const r = schema.safeParse(dados ?? {});
  if (r.success) return r.data;
  return schema.parse({});
}

/**
 * Saídas de cada passo (os "pontinhos" de baixo no quadro). O id é o
 * `sourceHandle` gravado na ligação; o motor segue a ligação cujo handle bate.
 */
export function saidasDoPasso(tipo: TipoDePasso, dados: unknown): { id: string; rotulo: string }[] {
  switch (tipo) {
    case "pedir_escolher": {
      const c = lerConfig("pedir_escolher", dados);
      return [
        ...c.opcoes.map((o, i) => ({ id: `opcao-${i}`, rotulo: `${i + 1}. ${o}` })),
        { id: "invalida", rotulo: "Não respondeu certo" },
      ];
    }
    case "mensagem_contem":
      return [
        { id: "sim", rotulo: "Contém" },
        { id: "nao", rotulo: "Não contém" },
      ];
    case "horarios":
      return [
        { id: "dentro", rotulo: "Dentro do horário" },
        { id: "fora", rotulo: "Fora do horário" },
      ];
    case "dias_semana":
      return [
        { id: "sim", rotulo: "Nos dias marcados" },
        { id: "nao", rotulo: "Nos outros dias" },
      ];
    case "transferir_equipe":
    case "transferir_atendente":
    case "finalizar_conversa":
    case "bloco_de_notas":
      return [];
    default:
      return [{ id: "proximo", rotulo: "" }];
  }
}

/** Forma do desenho salvo em `chatbot_flows.grafo`. */
export const grafoSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        type: z.string().min(1).max(40),
        position: z.object({ x: z.number(), y: z.number() }),
        data: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(200),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        source: z.string().min(1).max(64),
        target: z.string().min(1).max(64),
        sourceHandle: z.string().max(40).nullable().optional(),
      }),
    )
    .max(400),
});
export type Grafo = z.infer<typeof grafoSchema>;
