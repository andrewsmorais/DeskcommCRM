import type { SupabaseClient } from "@supabase/supabase-js";

import { followupPublicadoDoEnrollment } from "@/lib/agent-engine/agent/janela-de-followup";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { logger } from "@/lib/logger";

import { ESCOLHA_PADRAO, lerEscolhaNoEnvio, type EscolhaNoEnvio } from "./escolha-no-envio";

/**
 * A LEITURA da escolha de envio do FOLLOW-UP (trazida do produto original, #3813).
 *
 * Separada do vocabulário de propósito: `escolha-no-envio.ts` é importado por
 * schemas (validação da regra e do follow-up publicado), e trazer para lá a
 * leitura do banco arrastaria o motor de follow-up para dentro de uma validação.
 *
 * A escolha do fluxo mora em `ai_agent_versions.followup.quando_ha_compromisso`,
 * ao lado de `send_window`: as duas são regras de envio proativo, e a mesma
 * configuração publicada é lida pelos caminhos do tick, do texto fixo e do
 * turno do worker.
 *
 * Falha de leitura NÃO derruba o envio: cai no padrão (`adiar`), que é o
 * comportamento de sempre e o lado seguro.
 */

/** A configuração publicada do agente pinado no enrollment (Supabase). */
async function followupPublicadoSupabase(
  admin: SupabaseClient,
  organizationId: string,
  enrollmentId: string,
): Promise<unknown | null> {
  const { data: inscricao, error: falhaInscricao } = await admin
    .from("followup_enrollments")
    .select("agent_id")
    .eq("organization_id", organizationId)
    .eq("id", enrollmentId)
    .maybeSingle();
  if (falhaInscricao) throw new Error(falhaInscricao.message);
  const agentId = (inscricao as { agent_id?: string | null } | null)?.agent_id;
  if (typeof agentId !== "string" || agentId === "") return null;

  const { data: agente, error: falhaAgente } = await admin
    .from("ai_agents")
    .select("published_version_id")
    .eq("organization_id", organizationId)
    .eq("id", agentId)
    .maybeSingle();
  if (falhaAgente) throw new Error(falhaAgente.message);
  const versionId = (agente as { published_version_id?: string | null } | null)?.published_version_id;
  if (typeof versionId !== "string" || versionId === "") return null;

  const { data: versao, error: falhaVersao } = await admin
    .from("ai_agent_versions")
    .select("followup")
    .eq("organization_id", organizationId)
    .eq("id", versionId)
    .maybeSingle();
  if (falhaVersao) throw new Error(falhaVersao.message);
  return (versao as { followup?: unknown } | null)?.followup ?? null;
}

export async function escolhaDoFluxo(
  admin: SupabaseClient,
  organizationId: string,
  enrollmentId: string,
): Promise<EscolhaNoEnvio> {
  try {
    return lerEscolhaNoEnvio(await followupPublicadoSupabase(admin, organizationId, enrollmentId));
  } catch (err) {
    logger.warn("[agenda] escolha do follow-up não lida; vale o padrão (adiar)", {
      organization_id: organizationId,
      enrollment_id: enrollmentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return ESCOLHA_PADRAO;
  }
}

/** A MESMA leitura do lado `pg` (o turno do worker fala `pg`, não PostgREST). */
export async function escolhaDoFluxoPg(
  db: Queryable,
  organizationId: string,
  enrollmentId: string,
): Promise<EscolhaNoEnvio> {
  try {
    return lerEscolhaNoEnvio(await followupPublicadoDoEnrollment(db, organizationId, enrollmentId));
  } catch (err) {
    logger.warn("[agenda] escolha do follow-up não lida (pg); vale o padrão (adiar)", {
      organization_id: organizationId,
      enrollment_id: enrollmentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return ESCOLHA_PADRAO;
  }
}
