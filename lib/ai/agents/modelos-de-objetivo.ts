import type { VersionInput } from "./validation";
import { TOOLS_AGENDAMENTO } from "@/lib/mcp/tools/catalogo/agendamento";
import {
  ligarPacote,
  TETO_TOOLS_POR_AGENTE,
  type CapacidadeSelecionavel,
} from "@/lib/mcp/tools/selecao-por-pacote";

export const OBJETIVOS_DO_AGENTE = [
  { id: "atendimento", rotulo: "Atendimento" },
  { id: "vendas", rotulo: "Vendas" },
  { id: "suporte", rotulo: "Suporte" },
  { id: "agendamento", rotulo: "Agendamento" },
] as const;

export type ObjetivoDoAgente = (typeof OBJETIVOS_DO_AGENTE)[number]["id"];

export type ModeloInicialDoAgente = Pick<
  VersionInput,
  "system_prompt" | "tool_ids" | "cases_enabled"
> & { name: string; description: string };

const INSTRUCOES: Record<ObjetivoDoAgente, string> = {
  atendimento:
    "Acolha quem entra em contato, entenda o que precisa e ajude com as informações dos materiais selecionados. Faça perguntas objetivas, uma de cada vez. Quando a resolução depender da equipe, encaminhe o contexto e a dúvida que precisa ser resolvida.",
  vendas:
    "Entenda a necessidade da pessoa antes de apresentar uma oferta. Use os produtos, serviços e condições disponíveis nos materiais selecionados. Registre as informações úteis da conversa e acompanhe a oportunidade no funil autorizado conforme ela avança. Combine o próximo passo com a pessoa.",
  suporte:
    "Entenda o problema e peça os detalhes necessários para orientar a pessoa. Use as orientações dos materiais selecionados e confira se os passos resolveram a dificuldade. Quando depender de uma decisão ou informação da equipe, abra uma pendência com o que já foi tentado e a pergunta que falta resolver.",
  agendamento:
    "Entenda qual atendimento a pessoa procura, confira os compromissos que ela já tem e consulte os horários disponíveis. Ofereça opções reais e registre o horário escolhido. Explique se a reserva ainda depende de confirmação. Quando a pessoa pedir uma mudança, consulte a disponibilidade antes de remarcar.",
};

/** Só prepara campos existentes. Não escolhe credencial, canal, acervo ou funil. */
export function criarModeloDeObjetivo({
  objetivo,
  nomeDaOrganizacao,
  catalogo,
  t = (texto) => texto,
}: {
  objetivo: ObjetivoDoAgente;
  nomeDaOrganizacao: string;
  catalogo: readonly CapacidadeSelecionavel[];
  t?: (texto: string) => string;
}): { ok: true; modelo: ModeloInicialDoAgente } | { ok: false; motivo: "limite_de_capacidades" } {
  const disponiveis = catalogo.filter((capacidade) => capacidade.marcavel !== false && capacidade.risco !== "critico");
  const agenda = new Set(TOOLS_AGENDAMENTO.map((capacidade) => capacidade.name));
  const toolIds = objetivo === "agendamento"
    ? disponiveis.filter((capacidade) => agenda.has(capacidade.name)).map((capacidade) => capacidade.name)
    : ligarPacote([], disponiveis, objetivo === "vendas" ? "vender" : "atender");

  if (toolIds.length > TETO_TOOLS_POR_AGENTE) return { ok: false, motivo: "limite_de_capacidades" };
  const rotulo = t(OBJETIVOS_DO_AGENTE.find((item) => item.id === objetivo)!.rotulo);
  const empresa = nomeDaOrganizacao.trim();
  return {
    ok: true,
    modelo: {
      name: empresa ? `${rotulo} — ${empresa}`.slice(0, 120) : rotulo,
      description: t(INSTRUCOES[objetivo]),
      system_prompt: [
        empresa ? `${t("Você atende em nome de")} ${empresa}.` : t("Você atende os clientes desta empresa."),
        t(INSTRUCOES[objetivo]),
      ].join("\n\n"),
      tool_ids: [...new Set(toolIds)],
      cases_enabled: objetivo === "suporte",
    },
  };
}
