/**
 * Follow-up SÓ PELO CHATBOT — decisão do dono do produto (03/11/2026). PURO.
 *
 * No plano que não inclui o "Follow-up automático" (o Essencial), o follow-up
 * existe para o card "Iniciar follow-up" do chatbot, e para mais nada:
 *
 *  - começa à mão (gatilho `manual`): silêncio, etapa, lead novo, cliente que
 *    voltou, caso aberto e webhook continuam do Impulso;
 *  - só passos sem IA e sem processo: espera de tempo fixo, mensagem de texto
 *    ou modelo aprovado, tarefa interna e fim — condição, classificação por IA,
 *    mensagem escrita pela IA, espera "inteligente", repetição, coleta e skill
 *    continuam do Impulso;
 *  - quem inscreve é o chatbot: o agente de IA, as automações e a tela/API
 *    continuam do Impulso (a recusa mora em `lib/followup/enroll.ts`).
 *
 * Por que três travas e não uma: o follow-up tem três portas de entrada
 * (publicar, inscrever, rodar), e cada uma é alcançável sem passar pelas
 * outras — um fluxo publicado no Impulso continua publicado depois do
 * rebaixamento. A regra é a mesma nas três, e é esta.
 */
import type { FlowGraph } from "@/lib/followup/graph-schema";

/** Quem pede a inscrição — o plano decide quais origens valem. */
export type OrigemDaInscricao = "chatbot" | "agente" | "automacao" | "tela";

/**
 * O que impede o fluxo de rodar só pelo chatbot, em texto para quem monta.
 * Vazio = cabe. `gatilho` é o `trigger_config.kind` do fluxo.
 */
export function problemasDoFollowupPeloChatbot(graph: FlowGraph, gatilho: string): string[] {
  const problemas: string[] = [];
  if (gatilho !== "manual")
    problemas.push("o início precisa ser manual — quem põe o contato no follow-up é o chatbot");
  for (const no of graph.nodes) {
    const nome = "label" in no && no.label ? `“${no.label}”` : "um passo";
    switch (no.type) {
      case "trigger":
      case "internal_task":
        break;
      case "wait":
        if (no.config.mode !== "fixed")
          problemas.push(
            `${nome}: a espera precisa ter tempo fixo (a escolhida pela IA é do Impulso)`,
          );
        break;
      case "action":
        if (no.config.mode === "ai_message")
          problemas.push(`${nome}: mensagem escrita pela IA é do Impulso — use texto ou modelo`);
        break;
      case "end":
        if (no.config.ao_finalizar?.tipo === "skill")
          problemas.push(`${nome}: chamar uma skill no fim é do Impulso`);
        break;
      default:
        problemas.push(`${nome}: condições, IA, repetição e coleta são do Impulso`);
    }
  }
  return [...new Set(problemas)];
}

export function cabeNoFollowupPeloChatbot(graph: FlowGraph, gatilho: string): boolean {
  return problemasDoFollowupPeloChatbot(graph, gatilho).length === 0;
}

/** A frase de recusa do publicar, com o que tirar. */
export function mensagemDoFollowupPeloChatbot(problemas: string[]): string {
  return (
    "No seu plano, o follow-up roda só pelo chatbot (card “Iniciar follow-up”), com texto ou modelo, espera de tempo fixo e tarefa. Ajuste: " +
    problemas.join("; ") +
    ". O follow-up completo, com IA e gatilhos automáticos, é do plano Impulso."
  );
}
