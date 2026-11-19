/**
 * O USO da organização contra os limites de um plano — para DESCER de plano.
 *
 * Criar acima do limite já é barrado na criação (cotas de canal, agente,
 * chatbot, funil e equipe). Faltava a outra ponta: descer para um plano menor
 * mantendo o que só cabe no maior. No teste grátis a troca vale na hora, e
 * "subir para o Escala, montar 6 números e 3 agentes, descer para o Essencial"
 * dava o Escala pelo preço do Essencial para sempre (auditoria de 19/11).
 *
 * A regra é a da Umbler Talk: para descer, primeiro ficar dentro do plano
 * novo. A contagem é a MESMA de cada cota (os mesmos filtros da tela de Plano
 * e cobrança), e qualquer leitura que falhe RECUSA a descida — nunca a deixa
 * passar no escuro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  LIMITES_DO_PLANO,
  PLANOS_COMERCIAIS,
  type LimiteDoPlano,
  type PlanoComercial,
} from "@/lib/billing/catalogo";
import { consultarCotaDaEquipe } from "@/lib/billing/equipe";
import { contarCanaisDoPlano } from "@/lib/channels/cota-do-plano";

export type UsoDoPlano = Record<LimiteDoPlano, number>;

export type ExcessoDoPlano = { limite: LimiteDoPlano; uso: number; maximo: number };

/** `null` = alguma contagem falhou (quem chama recusa). */
export async function lerUsoDoPlano(db: SupabaseClient, orgId: string): Promise<UsoDoPlano | null> {
  try {
    const [canais, funis, agentes, chatbots, equipe] = await Promise.all([
      contarCanaisDoPlano(db, orgId),
      db
        .from("crm_pipelines")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("is_archived", false),
      db
        .from("ai_agents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("archived_at", null),
      db
        .from("chatbot_flows")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("is_active", true),
      consultarCotaDaEquipe(db, orgId),
    ]);
    if (canais.error || funis.error || agentes.error || chatbots.error) return null;
    const contagens = [canais.count, funis.count, agentes.count, chatbots.count];
    if (contagens.some((c) => typeof c !== "number")) return null;
    return {
      whatsapp: canais.count as number,
      pipelines: funis.count as number,
      agentes_ia: agentes.count as number,
      chatbots: chatbots.count as number,
      usuarios: equipe.ocupados + equipe.reservados,
    };
  } catch {
    return null;
  }
}

/** O que passa do pacote do plano (os números da página, nunca os de uma proposta). */
export function excessosParaOPlano(uso: UsoDoPlano, plano: PlanoComercial): ExcessoDoPlano[] {
  const pacote = PLANOS_COMERCIAIS[plano];
  return LIMITES_DO_PLANO.filter((k) => uso[k] > pacote[k]).map((k) => ({
    limite: k,
    uso: uso[k],
    maximo: pacote[k],
  }));
}

const ROTULO: Record<LimiteDoPlano, string> = {
  whatsapp: "números de WhatsApp conectados",
  pipelines: "funis",
  agentes_ia: "agentes de IA",
  chatbots: "chatbots ligados",
  usuarios: "pessoas na equipe (com convites pendentes)",
};

/** "3 agentes de IA (o Essencial permite 1)", uma linha por excesso. */
export function frasesDoExcesso(excessos: ExcessoDoPlano[], plano: PlanoComercial): string {
  const nome = PLANOS_COMERCIAIS[plano].nome;
  return excessos
    .map((e) => `${e.uso} ${ROTULO[e.limite]} (o ${nome} permite ${e.maximo})`)
    .join("; ");
}
