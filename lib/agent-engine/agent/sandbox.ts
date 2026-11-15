import type pg from "pg";
import { loadAgentVersionConfig } from "./agent-config";
import { runAgentPreview, type InboundTurnDeps } from "./inbound-turn";
import { newPreviewResult, scenarioContext } from "./preview";
import type { LeadContextMessage } from "../edge/crm/get-lead-context";
import { trimTranscriptToBudget } from "./compaction";

/** Uma mensagem anterior do teste — o que o admin digitou e o que a IA respondeu. */
export interface TesteHistoryMessage {
  direction: "inbound" | "outbound";
  body: string;
}

export async function testAgentVersion(
  pool: pg.Pool,
  deps: InboundTurnDeps,
  input: {
    organizationId: string;
    agentId: string;
    versionId: string;
    runId: string;
    sampleMessage: string;
    /** A conversa do teste até aqui (vive só na tela; o corpo é o transporte). */
    history?: TesteHistoryMessage[];
    sampleContact?: { name?: string; phone?: string };
    channelId: string | null;
  },
) {
  const agent = await loadAgentVersionConfig(
    pool,
    input.organizationId,
    input.agentId,
    input.versionId,
  );
  if (!agent) throw new Error("preview_version_unavailable");
  const result = newPreviewResult();
  // O contexto do teste é a CONVERSA, e passa pelas mesmas duas peneiras do
  // turno real (janela de mensagens e orçamento de tokens da versão). A
  // mensagem nova é sempre a última; se nem ela couber, vai sozinha.
  const agora = deps.clock?.() ?? new Date();
  const anteriores: LeadContextMessage[] = (input.history ?? []).map((m, i, todos) => ({
    direction: m.direction,
    body: m.body,
    // Horários crescentes e fictícios: só ordenam a leitura no prompt.
    sent_at: new Date(agora.getTime() - (todos.length - i) * 60_000).toISOString(),
  }));
  const novaMensagem: LeadContextMessage = {
    direction: "inbound",
    body: input.sampleMessage,
    sent_at: agora.toISOString(),
  };
  const janelaDeMensagens = Math.max(1, agent.historyMessageWindow);
  const naJanela = [...anteriores, novaMensagem].slice(-janelaDeMensagens);
  const orcado = trimTranscriptToBudget(naJanela, agent.historyTokenWindow);
  const context = scenarioContext(orcado.length > 0 ? orcado : [novaMensagem], input.sampleContact);
  await runAgentPreview(deps, pool, {
    kind: "sandbox",
    organizationId: input.organizationId,
    runId: input.runId,
    agent,
    context,
    contactId: null,
    channelId: input.channelId,
    result,
  });
  return result;
}
