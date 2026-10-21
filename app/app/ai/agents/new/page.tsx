import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { createClient } from "@/lib/supabase/server";
import type { CredentialRow } from "@/hooks/ai/useCredentials";

import { lerAmbiente } from "@/lib/instalacao/ambiente";
import { fusoUtilizavel } from "@/lib/tempo/fusos";
import type { FunilDaResposta } from "@/hooks/pipelines/usePipelines";
import { coberturaDoFunil, type EtapaDoMapa } from "@/lib/leads/agent-mapping";
import type { MaterialDoAcervo } from "../[id]/_components/BasesDoAgente";
import type { CoberturaPorFunil } from "../[id]/_components/FunisDoAgente";

import { AgentForm } from "../[id]/_components/AgentForm";

export const dynamic = "force-dynamic";

const CREDENTIAL_COLUMNS =
  "id, organization_id, provider, label, api_key_last4, validated_at, validation_error, models_available, is_active, created_by, created_at, updated_at";

/**
 * Os provedores cuja chave veio na INSTALAÇÃO (`.env`), não da tela de
 * Credenciais.
 *
 * Sai de `lerAmbiente`, a mesma leitura que o retrato da instalação usa — uma
 * segunda lista de nomes de variável divergiria no dia em que um provedor novo
 * entrasse.
 */
function provedoresDaInstalacao(): string[] {
  const a = lerAmbiente();
  return Object.entries(a.chavesDeProvedor)
    .filter(([, tem]) => tem)
    .map(([id]) => id);
}

export default async function NewAgentPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const supabase = await createClient();
  const [orgRes, credentialsRes, channelSessions, funisRes, acervoRes, etapasRes] = await Promise.all([
    // O provedor que a organização JÁ usa: sem ele, o agente novo nascia
    // `anthropic` e o formulário pedia "Cadastrar credencial anthropic" para
    // quem só tem chave da OpenAI.
    supabase.from("organizations").select("settings").eq("id", activeOrg.orgId).maybeSingle(),
    supabase
      .from("ai_provider_credentials_safe")
      .select(CREDENTIAL_COLUMNS)
      .eq("organization_id", activeOrg.orgId),
    listSelectableChannels(supabase, activeOrg.orgId),
    supabase
      .from("crm_pipelines")
      .select("id, name, slug, description, position, is_default")
      .eq("organization_id", activeOrg.orgId)
      .eq("is_archived", false)
      .order("position"),
    supabase
      .from("ai_knowledge_sources")
      .select("id, name, source_type, chunks_count, last_index_status, is_active")
      .eq("organization_id", activeOrg.orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_stages")
      .select("id, name, is_won, is_lost, agent_stage_hint, pipeline_id")
      .eq("organization_id", activeOrg.orgId)
      .eq("is_archived", false),
  ]);

  const credentials = (credentialsRes.data ?? []) as CredentialRow[];
  const funis = (funisRes.data ?? []) as unknown as FunilDaResposta[];
  const materiais = (acervoRes.data ?? []) as unknown as MaterialDoAcervo[];
  const etapasPorFunil = new Map<string, EtapaDoMapa[]>();
  for (const etapa of (etapasRes.data ?? []) as Array<EtapaDoMapa & { pipeline_id: string }>) {
    etapasPorFunil.set(etapa.pipeline_id, [...(etapasPorFunil.get(etapa.pipeline_id) ?? []), etapa]);
  }
  const cobertura: CoberturaPorFunil = {};
  for (const funil of funis) {
    const resultado = coberturaDoFunil(etapasPorFunil.get(funil.id) ?? []);
    cobertura[funil.id] = { traduzidos: resultado.traduzidos, total: resultado.total, mudo: resultado.mudo };
  }
  const llmDaOrg = (
    orgRes.data?.settings as { llm?: { provider?: string } } | null
  )?.llm;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <AgentForm
        mode="create"
        nomeDaOrganizacao={activeOrg.name}
        credentials={credentials}
        provedoresDaInstalacao={provedoresDaInstalacao()}
        provedorPadrao={llmDaOrg?.provider}
        channelSessions={channelSessions}
        funis={funis}
        materiais={materiais}
        cobertura={cobertura}
        organizationTimezone={fusoUtilizavel(activeOrg.timezone)}
      />
    </div>
  );
}
