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
export async function ferramentasDoPlano(
  organizationId: string,
  toolIds: readonly string[],
): Promise<{ toolIds: string[]; retiradas: string[] }> {
  const candidatas = toolIds.filter(eSoDeOrganizar);
  if (candidatas.length === 0) return { toolIds: [...toolIds], retiradas: [] };
  const acesso = await verificarRecursoDoPlano(organizationId, "organizar_crm");
  if (acesso.ok || acesso.code !== "billing_feature") {
    return { toolIds: [...toolIds], retiradas: [] };
  }
  return {
    toolIds: toolIds.filter((id) => !eSoDeOrganizar(id)),
    retiradas: candidatas,
  };
}
