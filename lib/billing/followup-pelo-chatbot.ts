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
import { ETAPAS_DO_EVENTO, normalizar, type EventoDaVenda } from "@/lib/webhooks/plataformas-de-venda";

/**
 * RECUPERAÇÃO DE VENDA EM TODOS OS PLANOS — decisão do dono, 20/11/2026.
 *
 * O aviso da loja (Shopify, Yampi, Kiwify…) leva o negócio a uma etapa com o
 * nome do evento. No Essencial, o follow-up pode começar SOZINHO quando o
 * negócio entra numa destas etapas — e só nelas —, com as mesmas peças sem IA
 * do "só pelo chatbot". Custo de IA zero; a mensagem escrita pela IA continua
 * do Impulso. Fora destas etapas, gatilho automático segue do Impulso.
 */
const EVENTOS_DE_RECUPERACAO: readonly EventoDaVenda[] = [
  "carrinho_abandonado",
  "aguardando_pagamento",
  "compra_recusada",
  "pagamento_expirado",
];

/** O gatilho de etapa, quando a etapa é de recuperação de venda. */
export const GATILHO_DE_RECUPERACAO = "recuperacao_de_venda";

export function ehEtapaDeRecuperacao(nomeDaEtapa: string | null | undefined): boolean {
  if (!nomeDaEtapa) return false;
  const nome = normalizar(nomeDaEtapa);
  return EVENTOS_DE_RECUPERACAO.some((e) => ETAPAS_DO_EVENTO[e].includes(nome));
}

/**
 * O gatilho como o PLANO o enxerga: `stage_change` numa etapa de recuperação
 * vira `recuperacao_de_venda`; o resto, como está. Quem chama lê o nome da etapa.
 */
export function gatilhoParaOPlano(kind: string, nomeDaEtapa: string | null): string {
  return kind === "stage_change" && ehEtapaDeRecuperacao(nomeDaEtapa) ? GATILHO_DE_RECUPERACAO : kind;
}

/** Quem pede a inscrição — o plano decide quais origens valem. */
export type OrigemDaInscricao = "chatbot" | "agente" | "automacao" | "tela";

/**
 * O que impede o fluxo de rodar só pelo chatbot, em texto para quem monta.
 * Vazio = cabe. `gatilho` é o `trigger_config.kind` do fluxo.
 */
export function problemasDoFollowupPeloChatbot(graph: FlowGraph, gatilho: string): string[] {
  const problemas: string[] = [];
  if (gatilho !== "manual" && gatilho !== GATILHO_DE_RECUPERACAO)
    problemas.push(
      "o início precisa ser manual (quem põe o contato é o chatbot) ou pela etapa de recuperação de venda: Carrinho abandonado, Aguardando pagamento, Pagamento recusado ou Pagamento expirado",
    );
  for (const no of graph.nodes) {
    const nome = "label" in no && no.label ? `“${no.label}”` : "um passo";
    switch (no.type) {
      case "trigger":
      case "internal_task":
      case "crm_update":
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
    "No seu plano, o follow-up roda pelo chatbot (card “Iniciar follow-up”) ou pela etapa de recuperação de venda, com texto ou modelo, espera de tempo fixo e tarefa. Ajuste: " +
    problemas.join("; ") +
    ". O follow-up completo, com IA e gatilhos automáticos, é do plano Impulso."
  );
}
