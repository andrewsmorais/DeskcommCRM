/**
 * "Agente que organiza o CRM sozinho" (Impulso em diante) = as capacidades que
 * pertencem SÓ ao pacote "Organizar a operação" (marcadores, etapas, avisos
 * automáticos, distribuição de trabalho, leituras gerenciais). Capacidade que
 * também serve a outro pacote ("Vender e mover o funil", "Atender") continua
 * no Essencial: o agente de vendas do Essencial move o cliente no funil.
 *
 * Aplicado no TURNO (não só na tela): agente publicado antes de um downgrade,
 * ou configurado por fora da tela, perde estas capacidades enquanto o plano
 * não as incluir — capacidade é do plano atual, como as skills.
 */
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalogo";
import { verificarRecursoDoPlano } from "./acesso";

const SO_ORGANIZAR: ReadonlySet<string> = new Set(
  TOOL_CATALOG.filter((t) => t.pacotes.length > 0 && t.pacotes.every((p) => p === "organizar")).map(
    (t) => t.name,
  ),
);

export function eSoDeOrganizar(toolId: string): boolean {
  return SO_ORGANIZAR.has(toolId);
}

/**
 * Tira do turno as capacidades só de "Organizar" quando o plano não inclui o
 * recurso. Leitura do plano indisponível NÃO tira nada (falha aberta só aqui,
 * porque a trava de assinatura inativa já para o agente inteiro antes).
 */
/**
 * Ferramentas de proposta comercial são o recurso "Comandas e propostas"
 * (Impulso em diante). O handler também recusa (é a trava de verdade); tirar do
 * turno evita o modelo oferecer ao cliente uma proposta que não vai sair.
 */
const DE_PROPOSTAS: ReadonlySet<string> = new Set(["crm_draft_proposal", "crm_preparar_proposta"]);

export function eDePropostas(toolId: string): boolean {
  return DE_PROPOSTAS.has(toolId);
}

async function semORecurso(
  organizationId: string,
  recurso: "organizar_crm" | "comandas_e_propostas",
): Promise<boolean> {
  const acesso = await verificarRecursoDoPlano(organizationId, recurso);
  return !acesso.ok && acesso.code === "billing_feature";
}

export async function ferramentasDoPlano(
  organizationId: string,
  toolIds: readonly string[],
): Promise<{ toolIds: string[]; retiradas: string[] }> {
  const fora = new Set<string>();
  const deOrganizar = toolIds.filter(eSoDeOrganizar);
  if (deOrganizar.length > 0 && (await semORecurso(organizationId, "organizar_crm"))) {
    for (const id of deOrganizar) fora.add(id);
  }
  const dePropostas = toolIds.filter(eDePropostas);
  if (dePropostas.length > 0 && (await semORecurso(organizationId, "comandas_e_propostas"))) {
    for (const id of dePropostas) fora.add(id);
  }
  return {
    toolIds: toolIds.filter((id) => !fora.has(id)),
    retiradas: toolIds.filter((id) => fora.has(id)),
  };
}
