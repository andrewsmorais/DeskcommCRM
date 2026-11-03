/**
 * "Ver ideias de bot" do editor de chatbot: fluxos prontos para começar, como
 * na Umbler Talk. PURO — a tela chama `montarIdeia` com um gerador de id e
 * recebe nós e ligações já organizados (`organizarBlocos`).
 *
 * Toda ideia usa só passos do catálogo (`lib/chatbot/passos.ts`) com a
 * configuração validada pelo mesmo schema do editor; o teste
 * (`ideias.test.ts`) reprova ideia com passo inexistente, ligação para saída
 * que o passo não tem, ou fluxo sem início. O que depende da conta (número,
 * tipo de atendimento da Agenda) fica para quem usa escolher — a validação de
 * "Ligar" aponta o que falta.
 */
import { configDoPasso, type Grafo, type TipoDePasso } from "./passos";
import { organizarBlocos } from "./organizar";

type NoDaIdeia = { chave: string; tipo: TipoDePasso; dados?: Record<string, unknown> };
type LigacaoDaIdeia = [de: string, para: string, saida?: string];

export type Ideia = {
  id: string;
  nome: string;
  descricao: string;
  nos: NoDaIdeia[];
  ligacoes: LigacaoDaIdeia[];
};

export const IDEIAS_DE_BOT: readonly Ideia[] = [
  {
    id: "menu",
    nome: "Menu de atendimento",
    descricao: "Boas-vindas com opções numeradas: cada opção leva a um caminho.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      { chave: "oi", tipo: "enviar_mensagem", dados: { texto: "Olá! Que bom falar com você 😊" } },
      {
        chave: "menu",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Como posso ajudar?",
          opcoes: ["Quero comprar", "Preciso de suporte", "Falar com uma pessoa"],
        },
      },
      {
        chave: "vendas",
        tipo: "transferir_equipe",
        dados: { mensagem: "Perfeito! Já vou te passar para alguém da equipe de vendas." },
      },
      {
        chave: "suporte",
        tipo: "pedir_digitar",
        dados: { pergunta: "Me conta em poucas palavras o que aconteceu.", variavel: "problema" },
      },
      {
        chave: "suporte_equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Obrigado! Já vou te passar para o suporte." },
      },
      {
        chave: "pessoa",
        tipo: "transferir_equipe",
        dados: { mensagem: "Certo! Um atendente já vai falar com você." },
      },
    ],
    ligacoes: [
      ["ini", "oi"],
      ["oi", "menu"],
      ["menu", "vendas", "opcao-0"],
      ["menu", "suporte", "opcao-1"],
      ["suporte", "suporte_equipe"],
      ["menu", "pessoa", "opcao-2"],
      ["menu", "pessoa", "invalida"],
    ],
  },
  {
    id: "fora_do_horario",
    nome: "Fora do horário",
    descricao: "No horário, passa para a equipe; fora dele, avisa quando vocês voltam.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      { chave: "hora", tipo: "horarios", dados: { faixas: [{ inicio: "08:00", fim: "18:00" }] } },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Olá! Já vou te passar para alguém da equipe." },
      },
      {
        chave: "aviso",
        tipo: "finalizar_conversa",
        dados: {
          mensagem:
            "Olá! Nosso horário é das 8h às 18h. Deixe sua mensagem que respondemos assim que voltarmos.",
        },
      },
    ],
    ligacoes: [
      ["ini", "hora"],
      ["hora", "equipe", "dentro"],
      ["hora", "aviso", "fora"],
    ],
  },
  {
    id: "coletar_dados",
    nome: "Coletar dados antes de atender",
    descricao: "Pede nome e e-mail, grava no contato e só então passa para a equipe.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "form",
        tipo: "enviar_formulario",
        dados: {
          introducao: "Olá! Para te atender melhor, preciso de dois dados rapidinho.",
          perguntas: [
            { pergunta: "Qual é o seu nome?", variavel: "nome", tipo: "texto", gravar_em: "nome" },
            { pergunta: "E o seu e-mail?", variavel: "email", tipo: "email", gravar_em: "email" },
          ],
          conclusao: "Obrigado, {{nome}}!",
        },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Já vou te passar para alguém da equipe." },
      },
    ],
    ligacoes: [
      ["ini", "form"],
      ["form", "equipe"],
      ["form", "equipe", "invalida"],
    ],
  },
  {
    id: "satisfacao",
    nome: "Pesquisa de satisfação",
    descricao: "O atendente aciona no fim do atendimento: nota, comentário e despedida.",
    nos: [
      { chave: "ini", tipo: "inicio_manual" },
      { chave: "nota", tipo: "pedir_avaliacao" },
      { chave: "comentario", tipo: "pedir_feedback" },
      {
        chave: "fim",
        tipo: "finalizar_conversa",
        dados: { mensagem: "Obrigado pela avaliação! Até a próxima." },
      },
    ],
    ligacoes: [
      ["ini", "nota"],
      ["nota", "comentario"],
      ["nota", "fim", "invalida"],
      ["comentario", "fim"],
    ],
  },
  {
    id: "agendamento",
    nome: "Agendar horário",
    descricao: "Oferece os horários livres da Agenda e marca o que o cliente escolher.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "oi",
        tipo: "enviar_mensagem",
        dados: { texto: "Olá! Vamos marcar seu horário." },
      },
      { chave: "agenda", tipo: "agendar_horario" },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Vou te passar para alguém da equipe encontrar um horário com você." },
      },
    ],
    ligacoes: [
      ["ini", "oi"],
      ["oi", "agenda"],
      ["agenda", "equipe", "sem_horario"],
      ["agenda", "equipe", "invalida"],
    ],
  },
  {
    id: "triagem_ia",
    nome: "Triagem com o agente de IA",
    descricao: "Dúvidas vão para o agente de IA do número; quem pede uma pessoa vai para a equipe.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "menu",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Olá! Como prefere seguir?",
          opcoes: ["Tirar uma dúvida", "Falar com uma pessoa"],
        },
      },
      {
        chave: "ia",
        tipo: "transferir_ia",
        dados: { mensagem: "Certo! Pode mandar sua dúvida." },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Já vou te passar para alguém da equipe." },
      },
    ],
    ligacoes: [
      ["ini", "menu"],
      ["menu", "ia", "opcao-0"],
      ["menu", "equipe", "opcao-1"],
      ["menu", "equipe", "invalida"],
      ["ia", "equipe", "falha"],
    ],
  },
];

/** Os tipos de passo que a ideia usa (para a tela marcar o que o plano não inclui). */
export function passosDaIdeia(ideia: Ideia): TipoDePasso[] {
  return [...new Set(ideia.nos.map((n) => n.tipo))];
}

/**
 * Nós e ligações da ideia com ids novos, já organizados e deslocados para
 * começar em `origem` (a tela põe ao lado do que já está no quadro).
 */
export function montarIdeia(
  ideia: Ideia,
  novoId: () => string,
  origem: { x: number; y: number } = { x: 0, y: 0 },
): Grafo {
  const ids = new Map(ideia.nos.map((n) => [n.chave, novoId()]));
  const nodes = ideia.nos.map((n) => ({
    id: ids.get(n.chave)!,
    type: n.tipo,
    position: { x: 0, y: 0 },
    data: configDoPasso[n.tipo].parse(n.dados ?? {}) as Record<string, unknown>,
  }));
  const edges = ideia.ligacoes.map(([de, para, saida = "proximo"]) => ({
    id: novoId(),
    source: ids.get(de)!,
    target: ids.get(para)!,
    sourceHandle: saida,
  }));
  const pos = organizarBlocos(nodes, edges);
  const minX = Math.min(...[...pos.values()].map((p) => p.x));
  const minY = Math.min(...[...pos.values()].map((p) => p.y));
  return {
    nodes: nodes.map((n) => {
      const p = pos.get(n.id)!;
      return { ...n, position: { x: p.x - minX + origem.x, y: p.y - minY + origem.y } };
    }),
    edges,
  };
}
