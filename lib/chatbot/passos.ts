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

import { descreverRegra } from "./regras";

export const GRUPOS_DE_PASSO = [
  { id: "inicio", nome: "Início" },
  { id: "condicao", nome: "Condição" },
  { id: "acao", nome: "Ação" },
  { id: "finalizacao", nome: "Finalização" },
  { id: "integracao", nome: "Integrações" },
  { id: "utilitarios", nome: "Utilitários" },
] as const;
export type GrupoDePasso = (typeof GRUPOS_DE_PASSO)[number]["id"];

const HORA = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato 08:30.");

/** Campos do contato que o passo "Campo do contato" grava e "Definir condição" lê. */
export const CAMPOS_DO_CONTATO = ["nome", "email", "aniversario", "personalizado"] as const;
export type CampoDoContato = (typeof CAMPOS_DO_CONTATO)[number];

const CHAVE = z
  .string()
  .trim()
  .regex(/^[a-z_][a-z0-9_]{0,39}$/, "Use letras minúsculas, números e _.");

/**
 * Uma regra de "Definir condição" / "Multi-condicional". O que ela olha:
 *   - `etiqueta`      — o contato tem (ou não) a etiqueta `valor`;
 *   - `variavel`      — o que foi guardado em "Pedir para digitar" (`chave`);
 *   - `campo_contato` — nome, e-mail, aniversário ou campo personalizado (`chave`);
 *   - `mensagem`      — a última mensagem do contato.
 */
export const regraSchema = z.object({
  fonte: z.enum(["etiqueta", "variavel", "campo_contato", "mensagem"]).default("etiqueta"),
  /** Nome da variável, ou o campo do contato (nome/email/aniversario/<chave personalizada>). */
  chave: z.string().trim().max(40).default(""),
  operador: z
    .enum([
      "tem",
      "nao_tem",
      "igual",
      "diferente",
      "contem",
      "preenchido",
      "vazio",
      "maior_ou_igual",
      "menor_ou_igual",
    ])
    .default("tem"),
  valor: z.string().trim().max(200).default(""),
  /** Nome da saída no quadro (só no Multi-condicional). */
  rotulo: z.string().trim().max(40).default(""),
});
export type Regra = z.infer<typeof regraSchema>;

/**
 * "Fluxo de espera" (na Umbler, o bot que roda quando o atendente demora): nos
 * passos de transferir, se ninguém da equipe responder em `espera_minutos`, o
 * chatbot manda `espera_mensagem` — até `espera_vezes` vezes, uma a cada
 * intervalo. Para assim que uma PESSOA responder na conversa. 0 = desligado.
 */
const ESPERA_DO_ATENDENTE = {
  espera_minutos: z.number().int().min(0).max(240).default(0),
  espera_mensagem: z.string().trim().max(1000).default(""),
  espera_vezes: z.number().int().min(1).max(3).default(1),
};

/** Tipos de arquivo que o passo "Enviar mídia" manda (os mesmos da conversa). */
export const TIPOS_DE_MIDIA = ["image", "video", "audio", "document"] as const;
export type TipoDeMidia = (typeof TIPOS_DE_MIDIA)[number];

/** O que fazer se o contato mandar mensagem enquanto o fluxo espera o relógio. */
const SE_RESPONDER = z.enum(["seguir", "esperar"]).default("seguir");

export const configDoPasso = {
  /**
   * Começa quando uma AUTOMAÇÃO manda (ação "Iniciar chatbot"): compra aprovada
   * na Kiwify, negócio que mudou de etapa, etiqueta nova. Não responde a
   * mensagem nenhuma — quem escolhe o contato é a regra. Um fluxo só com este
   * início pode ficar ligado junto com o fluxo de atendimento.
   */
  inicio_automacao: z.object({}),
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
    ...ESPERA_DO_ATENDENTE,
  }),
  transferir_atendente: z.object({
    user_id: z.string().uuid().nullable().default(null),
    mensagem: z.string().trim().max(1000).default(""),
    ...ESPERA_DO_ATENDENTE,
  }),
  editar_etiquetas: z.object({
    adicionar: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    remover: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  }),
  finalizar_conversa: z.object({
    mensagem: z.string().trim().max(1000).default(""),
  }),
  /** Nota interna na conversa (`conversation_notes`): a equipe vê, o contato não. */
  criar_nota: z.object({
    texto: z.string().trim().max(2000).default(""),
  }),
  campo_contato: z.object({
    campo: z.enum(CAMPOS_DO_CONTATO).default("nome"),
    /** Só para `personalizado`: a chave em `contacts.custom_fields`. */
    chave: CHAVE.or(z.literal("")).default(""),
    /** Aceita {{variavel}} — o caso comum é gravar o que o contato digitou. */
    valor: z.string().trim().max(500).default(""),
  }),
  definir_condicao: z.object({
    regra: regraSchema.default(regraSchema.parse({})),
  }),
  multi_condicional: z.object({
    regras: z
      .array(regraSchema)
      .min(1)
      .max(8)
      .default([regraSchema.parse({}), regraSchema.parse({})]),
  }),
  /** Nota de satisfação: 1 a 5 ou 0 a 10. Fica guardada em {{avaliacao}}. */
  pedir_avaliacao: z.object({
    pergunta: z
      .string()
      .trim()
      .max(2000)
      .default("De 1 a 5, que nota você dá para o nosso atendimento?"),
    escala: z.enum(["1_5", "0_10"]).default("1_5"),
    mensagem_invalida: z
      .string()
      .trim()
      .max(500)
      .default("Não entendi. Responda só com o número da nota."),
    tentativas: z.number().int().min(1).max(5).default(2),
  }),
  /** Comentário livre. Fica guardado em {{feedback}} e junto da nota. */
  pedir_feedback: z.object({
    pergunta: z
      .string()
      .trim()
      .max(2000)
      .default("Quer deixar um comentário sobre o atendimento?"),
  }),
  aguardar_intervalo: z.object({
    quantidade: z.number().int().min(1).max(999).default(5),
    unidade: z.enum(["segundos", "minutos", "horas", "dias"]).default("minutos"),
    se_responder: SE_RESPONDER,
  }),
  aguardar_ate: z.object({
    hora: HORA.default("09:00"),
    /** 0 = domingo … 6 = sábado. */
    dias: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
    se_responder: SE_RESPONDER,
  }),
  /**
   * Põe o contato num dos follow-ups publicados do CRM (os mesmos que o agente
   * de IA arma), pelo mesmo caminho da tela e das automações
   * (`enrollFollowupFlow`). Roteiro de atendimento não entra: ele começa na
   * conversa, não por inscrição.
   */
  iniciar_followup: z.object({
    pointer_id: z.string().uuid().nullable().default(null),
  }),
  /** Abre um aviso na Central de avisos, com link para a conversa. */
  notificar_atendente: z.object({
    mensagem: z.string().trim().max(500).default(""),
  }),
  /**
   * Chama um endereço de fora (n8n, Make, o sistema do cliente) e guarda
   * partes da resposta em variáveis. Segredo e autorização ficam CIFRADOS no
   * desenho (`*_enc`): o texto puro só passa pela rota que salva, que o cifra
   * (lib/chatbot/segredos.ts). Quem chama é lib/chatbot/webhook.ts.
   */
  webhook: z.object({
    /** Aceita {{variavel}} (vai codificada para URL). */
    url: z.string().trim().max(2000).default(""),
    metodo: z.enum(["POST", "GET"]).default("POST"),
    campos: z
      .array(
        z.object({
          /** Caminho no JSON da resposta: `status`, `pedido.status`, `itens.0.nome`. */
          caminho: z.string().trim().min(1).max(120),
          variavel: CHAVE,
        }),
      )
      .max(10)
      .default([]),
    segredo_enc: z.string().max(4000).nullable().default(null),
    autorizacao_enc: z.string().max(4000).nullable().default(null),
  }),
  bloco_de_notas: z.object({
    texto: z.string().max(4000).default(""),
  }),
  /**
   * Foto, vídeo, áudio ou documento. O arquivo fica no Storage da organização
   * (`whatsapp-media/<org>/chatbot/<fluxo>/…`, subido pela tela) e, no envio, é
   * COPIADO para a pasta da conversa — o mesmo caminho das fotos do catálogo:
   * a conversa mostra o arquivo e a LGPD o apaga junto com ela.
   */
  enviar_midia: z.object({
    storage_path: z.string().max(500).nullable().default(null),
    tipo: z.enum(TIPOS_DE_MIDIA).nullable().default(null),
    mime: z.string().max(160).default(""),
    nome_arquivo: z.string().max(200).default(""),
    /** Texto que vai junto (legenda). Aceita {{variavel}}. */
    legenda: z.string().trim().max(1024).default(""),
  }),
  /**
   * Oferece os próximos horários livres de um tipo de atendimento da Agenda e
   * marca o que o contato escolher — a mesma consulta e a mesma marcação que o
   * agente de IA usa (`lib/agenda/consulta.ts` + `marcarAgendamentoHandler`).
   */
  agendar_horario: z.object({
    event_type_id: z.string().uuid().nullable().default(null),
    /** null = o responsável padrão do tipo de atendimento. */
    owner_user_id: z.string().uuid().nullable().default(null),
    pergunta: z.string().trim().max(1000).default("Escolha um horário:"),
    quantidade: z.number().int().min(2).max(10).default(5),
    dias_a_frente: z.number().int().min(1).max(30).default(7),
    mensagem_invalida: z
      .string()
      .trim()
      .max(500)
      .default("Não entendi. Responda com o número de um dos horários."),
    tentativas: z.number().int().min(1).max(5).default(2),
    confirmacao: z
      .string()
      .trim()
      .max(1000)
      .default("Pronto! Seu horário ficou marcado para {{horario}}. Até lá!"),
    /** Atendimento que a equipe aprova antes: o horário fica reservado, não confirmado. */
    confirmacao_pendente: z
      .string()
      .trim()
      .max(1000)
      .default("Separei {{horario}} para você. A equipe confirma em breve."),
  }),
  /**
   * Põe o contato no funil: se ele já tem negócio aberto naquele funil, o
   * negócio vai para a etapa escolhida; se não tem, nasce nela. Pelos mesmos
   * handlers da tela (audita, emite `lead.created` / `lead.stage_changed`).
   */
  negocio_funil: z.object({
    pipeline_id: z.string().uuid().nullable().default(null),
    stage_id: z.string().uuid().nullable().default(null),
    /** Título do negócio novo. Vazio = o nome do contato. Aceita {{variavel}}. */
    titulo: z.string().trim().max(200).default(""),
    /** Só para o resumo no quadro ("Vendas › Interessado"); quem decide são os ids. */
    nome_do_destino: z.string().max(240).default(""),
  }),
  /**
   * Encerra este fluxo e começa outro (ou este mesmo, do início — o "voltar
   * ao menu"), levando as respostas já guardadas. O fluxo chamado precisa
   * estar ligado.
   */
  acionar_fluxo: z.object({
    flow_id: z.string().uuid().nullable().default(null),
    /** Só para o resumo no quadro; quem decide é o id. */
    nome_do_fluxo: z.string().max(120).default(""),
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
    tipo: "inicio_automacao",
    grupo: "inicio",
    nome: "Iniciar por automação",
    descricao: "Começa quando uma automação manda — ex.: compra aprovada na Kiwify ou na Cakto.",
    icone: "Zap",
    cor: "text-amber-500",
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
    tipo: "definir_condicao",
    grupo: "condicao",
    nome: "Definir condição",
    descricao: "Siga por um caminho ou outro conforme uma regra (etiqueta, resposta ou campo).",
    icone: "Split",
    cor: "text-sky-500",
    temEntrada: true,
  },
  {
    tipo: "multi_condicional",
    grupo: "condicao",
    nome: "Multi-condicional",
    descricao: "Várias regras, uma saída para cada. Vale a primeira que bater.",
    icone: "Network",
    cor: "text-sky-500",
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
    tipo: "enviar_midia",
    grupo: "acao",
    nome: "Enviar mídia",
    descricao: "Envie uma foto, vídeo, áudio ou PDF para o contato.",
    icone: "Paperclip",
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
    tipo: "agendar_horario",
    grupo: "acao",
    nome: "Agendar horário",
    descricao: "Ofereça os horários livres da Agenda e marque o que o contato escolher.",
    icone: "CalendarCheck",
    cor: "text-emerald-500",
    temEntrada: true,
  },
  {
    tipo: "negocio_funil",
    grupo: "acao",
    nome: "Negócio no funil",
    descricao: "Crie o negócio do contato numa etapa do funil, ou mova o que ele já tem.",
    icone: "Kanban",
    cor: "text-indigo-500",
    temEntrada: true,
  },
  {
    tipo: "acionar_fluxo",
    grupo: "acao",
    nome: "Acionar outro fluxo",
    descricao: "Encerre este fluxo e comece outro chatbot (ou volte ao início deste).",
    icone: "Workflow",
    cor: "text-violet-500",
    temEntrada: true,
  },
  {
    tipo: "transferir_equipe",
    grupo: "acao",
    nome: "Transferir para a equipe",
    descricao: "Passe a conversa para a fila de atendentes: ela fica como Aguardando até alguém pegar.",
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
    tipo: "campo_contato",
    grupo: "acao",
    nome: "Campo do contato",
    descricao: "Grave nome, e-mail, aniversário ou um campo personalizado no contato.",
    icone: "UserPen",
    cor: "text-indigo-400",
    temEntrada: true,
  },
  {
    tipo: "criar_nota",
    grupo: "acao",
    nome: "Criar uma nota",
    descricao: "Deixe uma nota interna na conversa. A equipe vê, o contato não.",
    icone: "NotebookPen",
    cor: "text-amber-500",
    temEntrada: true,
  },
  {
    tipo: "pedir_avaliacao",
    grupo: "acao",
    nome: "Pedir para avaliar",
    descricao: "Peça uma nota para o atendimento (1 a 5 ou 0 a 10).",
    icone: "Star",
    cor: "text-yellow-500",
    temEntrada: true,
  },
  {
    tipo: "pedir_feedback",
    grupo: "acao",
    nome: "Pedir feedback escrito",
    descricao: "Peça um comentário sobre o atendimento. Fica junto da nota.",
    icone: "MessageSquareQuote",
    cor: "text-yellow-500",
    temEntrada: true,
  },
  {
    tipo: "iniciar_followup",
    grupo: "acao",
    nome: "Iniciar follow-up",
    descricao: "Ponha o contato num dos follow-ups do CRM (os mesmos que o agente de IA usa).",
    icone: "Repeat",
    cor: "text-emerald-500",
    temEntrada: true,
  },
  {
    tipo: "notificar_atendente",
    grupo: "acao",
    nome: "Notificar atendente",
    descricao: "Abra um aviso na Central de avisos, com link para a conversa.",
    icone: "BellRing",
    cor: "text-orange-400",
    temEntrada: true,
  },
  {
    tipo: "aguardar_intervalo",
    grupo: "acao",
    nome: "Aguardar intervalo",
    descricao: "Espere um tempo (segundos, minutos, horas ou dias) antes de seguir.",
    icone: "Hourglass",
    cor: "text-purple-400",
    temEntrada: true,
  },
  {
    tipo: "aguardar_ate",
    grupo: "acao",
    nome: "Aguardar até",
    descricao: "Pause o fluxo até um horário (ex.: amanhã às 9h) e siga dali.",
    icone: "AlarmClock",
    cor: "text-purple-400",
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
    tipo: "webhook",
    grupo: "integracao",
    nome: "WebHook",
    descricao: "Chame um sistema de fora (n8n, Make, sua loja) e use a resposta no fluxo.",
    icone: "Webhook",
    cor: "text-pink-500",
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
    case "definir_condicao":
      return [
        { id: "sim", rotulo: "Regra atendida" },
        { id: "nao", rotulo: "Regra não atendida" },
      ];
    case "multi_condicional": {
      const c = lerConfig("multi_condicional", dados);
      return [
        ...c.regras.map((r, i) => ({ id: `regra-${i}`, rotulo: r.rotulo || descreverRegra(r) })),
        { id: "nenhuma", rotulo: "Nenhuma regra" },
      ];
    }
    case "campo_contato":
      return [
        { id: "proximo", rotulo: "Gravado" },
        { id: "invalido", rotulo: "Valor inválido" },
      ];
    case "pedir_avaliacao":
      return [
        { id: "proximo", rotulo: "Avaliou" },
        { id: "invalida", rotulo: "Não avaliou" },
      ];
    case "webhook":
      return [
        { id: "proximo", rotulo: "Deu certo" },
        { id: "falha", rotulo: "Falhou" },
      ];
    case "agendar_horario":
      return [
        { id: "proximo", rotulo: "Marcou" },
        { id: "sem_horario", rotulo: "Sem horário livre" },
        { id: "invalida", rotulo: "Não escolheu" },
      ];
    case "transferir_equipe":
    case "transferir_atendente":
    case "finalizar_conversa":
    case "acionar_fluxo":
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
