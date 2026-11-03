import type { FlowGraph } from "@/lib/followup/graph-schema";
import { verificarRecursoDoPlano, type AcessoAoRecurso } from "./acesso";
import { cabeNoFollowupPeloChatbot } from "./followup-pelo-chatbot";
import type { RecursoDoPlano } from "./catalogo";

/** Perguntas lineares de atendimento continuam no Essencial. Ramificação,
 * repetição, classificação e ações de um processo são o benefício avançado.
 */
export function recursosDoGrafo(graph: FlowGraph): RecursoDoPlano[] {
  const recursos = new Set<RecursoDoPlano>();
  for (const node of graph.nodes) {
    if (
      node.type === "skill" ||
      (node.type === "end" && node.config.ao_finalizar?.tipo === "skill")
    )
      recursos.add("skills");
    if (["condition", "repeat", "ai_classify", "match_reply", "action"].includes(node.type))
      recursos.add("processos");
  }
  return [...recursos];
}

export async function verificarGrafoDoPlano(
  orgId: string,
  graph: FlowGraph,
  /**
   * O `trigger_config.kind` do FOLLOW-UP (nunca do roteiro). Com ele, um fluxo
   * que cabe no "follow-up só pelo chatbot" passa em qualquer plano — ver
   * `followup-pelo-chatbot.ts`. Sem ele, a régua é a de sempre.
   */
  opts: { gatilho?: string | null } = {},
): Promise<AcessoAoRecurso> {
  if (opts.gatilho && cabeNoFollowupPeloChatbot(graph, opts.gatilho)) return { ok: true };
  for (const recurso of recursosDoGrafo(graph)) {
    const acesso = await verificarRecursoDoPlano(orgId, recurso);
    if (!acesso.ok) return acesso;
  }
  return { ok: true };
}
