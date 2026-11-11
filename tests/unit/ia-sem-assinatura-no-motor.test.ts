/**
 * SEM ASSINATURA ATIVA, O MOTOR NÃO CHAMA MODELO — nem no rascunho do modo
 * assistido, nem na prévia.
 *
 * ═══ O achado ═══
 *
 * A régua da assinatura (`EXIGIR_ASSINATURA=true`, a chave de IA é da
 * plataforma) morava em `executarTurnoDoAgente` atrás de `if (!preview)`, com
 * o argumento de que "a tela já está fechada sem plano". A tela fechada não
 * fecha a API nem o worker:
 *
 *   - o ramo assistido de `createInboundTurnHandler` gera o rascunho e devolve
 *     ANTES de `runAgentTurn` — e, antes ainda, escolher o agente pode
 *     perguntar ao classificador de intenção;
 *   - o rascunho (`generateReplyDraft`) e o teste do agente (`testAgentVersion`)
 *     rodam por `runAgentPreview`, que pulava a régua.
 *
 * Reproduzido pela auditoria contra o baseline real: turno automático com 0
 * chamadas ao modelo (controle); assistido com 1, rascunho `pending`.
 *
 * ═══ O que se mede aqui ═══
 *
 * Pelo CAMINHO DE PRODUÇÃO: o handler do worker (o mesmo harness de
 * `assistido-roda-as-deteccoes.test.ts`) e `runAgentPreview`. Dublê só na
 * LEITURA do plano — a decisão roda de verdade. Os controles positivos são o
 * que impede o verde por ausência: sem eles, um motor morto passaria.
 * As rotas que chamam o modelo pela tela estão em
 * `ia-sem-assinatura-nas-rotas.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishedAgentConfig } from "@/lib/agent-engine/agent/agent-config";

const mocks = vi.hoisted(() => ({
  leituraDoPlano: vi.fn(),
  router: vi.fn(),
  classify: vi.fn(),
  byId: vi.fn(),
  bySession: vi.fn(),
  conversationAgent: vi.fn(),
  draft: vi.fn(),
  passagem: vi.fn(),
  emHandoff: vi.fn(),
  elegibilidade: vi.fn(),
  leadContext: vi.fn(),
}));

vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  getOrganizationBilling: (...args: unknown[]) => mocks.leituraDoPlano(...args),
}));
vi.mock("@/lib/agent-engine/edge/crm/get-lead-context", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLeadContext: mocks.leadContext,
}));
vi.mock("@/lib/agent-engine/agent/fuso-da-org", () => ({
  fusoDaOrganizacao: vi.fn(async () => "UTC"),
}));
vi.mock("@/lib/ai/elegibilidade/consulta-pg", () => ({
  decidirElegibilidadeDaConversa: mocks.elegibilidade,
}));
vi.mock("@/lib/agent-engine/pacing/store", () => ({
  loadChannelKnobs: vi.fn(async () => ({ knobs: {} })),
}));
vi.mock("@/lib/agent-engine/pacing/engine", () => ({
  janelaDeEnvioAberta: () => true,
  proximaAberturaDaJanela: vi.fn(),
}));
vi.mock("@/lib/agent-engine/pacing/aviso-de-janela", () => ({
  resolverAvisoDeJanela: vi.fn(async () => 0),
  avisarJanelaFechada: vi.fn(),
}));
vi.mock("@/lib/agent-engine/agent/router-config", () => ({ loadActiveRouter: mocks.router }));
vi.mock("@/lib/agent-engine/agent/intent-classifier", () => ({ classifyIntent: mocks.classify }));
vi.mock("@/lib/agent-engine/agent/agent-config", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPublishedAgentConfigById: mocks.byId,
  loadPublishedAgentConfig: mocks.bySession,
  loadConversationAgentConfig: mocks.conversationAgent,
}));
vi.mock("@/lib/agent-engine/agent/reply-drafts", () => ({ generateReplyDraft: mocks.draft }));
vi.mock("@/lib/atendimento/fronteira-server", () => ({
  currentExecutionBoundary: () => undefined,
  setExecutionAgentOperation: vi.fn(),
  guardServiceEffect: vi.fn(),
}));
vi.mock("@/lib/agent-engine/agent/human-handoff", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isLeadInHandoff: mocks.emHandoff,
  performHumanHandoff: mocks.passagem,
}));

import {
  createInboundTurnHandler,
  runAgentPreview,
  type InboundTurnDeps,
} from "@/lib/agent-engine/agent/inbound-turn";
import { newPreviewResult, type TurnPreview } from "@/lib/agent-engine/agent/preview";

const ids = {
  org: "12000000-0000-4000-8000-000000000001",
  contact: "12000000-0000-4000-8000-000000000002",
  conversation: "12000000-0000-4000-8000-000000000003",
  channel: "12000000-0000-4000-8000-000000000004",
  job: "12000000-0000-4000-8000-000000000005",
  mensagem: "12000000-0000-4000-8000-000000000006",
  evento: "12000000-0000-4000-8000-000000000007",
};

const inbound = {
  id: ids.job,
  organization_id: ids.org,
  contact_id: ids.contact,
  kind: "inbound_turn",
  payload: {
    conversation_id: ids.conversation,
    contact_id: ids.contact,
    channel_session_id: ids.channel,
    inbound_message_id: ids.mensagem,
    crm_event_id: ids.evento,
  },
};

const deps = {
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  llmCfg: {},
  crmCfg: {},
  knobs: {},
  channel: () => ({ send: vi.fn(async () => ({ kind: "sent" })) }),
} as unknown as InboundTurnDeps;

const assistido = {
  agentId: "A",
  versionId: "version-A",
  operationRevision: "7",
  operationMode: "assisted",
  pausedAt: null,
  handoffKeywords: [],
} as unknown as PublishedAgentConfig;

const VENCIDA = {
  ok: true,
  billing: { is_active: false, plan_slug: "essencial", status: "past_due" },
};
const ATIVA = { ok: true, billing: { is_active: true, plan_slug: "essencial", status: "active" } };

function pool() {
  mocks.router.mockResolvedValue(null);
  mocks.byId.mockResolvedValue(assistido);
  mocks.bySession.mockResolvedValue(assistido);
  mocks.conversationAgent.mockResolvedValue(assistido);
  return {
    query: vi.fn(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("lead_checkpoints")) return { rows: [] };
      return { rows: [{ active_ai_agent_id: null, active_intent: null, body: "oi" }] };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXIGIR_ASSINATURA", "true");
  mocks.emHandoff.mockResolvedValue(false);
  mocks.elegibilidade.mockResolvedValue({ permite: true, motivo: "gate_aberto" });
  mocks.leadContext.mockResolvedValue({
    ok: true,
    tokenCount: 12,
    lgpd: { isAnonymized: false },
    context: {
      lead_id: ids.contact,
      contact: { name: "Cliente", phone: null, email: null, tags: [], is_blocked: false },
      conversation_id: ids.conversation,
      last_human_decision: null,
      messages: [{ direction: "inbound", body: "oi, tudo bem?" }],
    },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("worker — o ramo assistido e a escolha do agente respeitam a assinatura", () => {
  it("assinatura vencida: nem roteador nem rascunho", async () => {
    mocks.leituraDoPlano.mockResolvedValue(VENCIDA);
    const p = pool();

    await createInboundTurnHandler(deps)(inbound as never, p as never, { workerId: "w" });

    expect(mocks.leituraDoPlano).toHaveBeenCalledWith(ids.org);
    expect(mocks.draft, "rascunho escrito pela chave da plataforma").not.toHaveBeenCalled();
    expect(mocks.router, "escolher o agente pode chamar o classificador").not.toHaveBeenCalled();
    expect(mocks.classify).not.toHaveBeenCalled();
  });

  it("controle: assinatura ativa → o rascunho sai", async () => {
    mocks.leituraDoPlano.mockResolvedValue(ATIVA);
    const p = pool();

    await createInboundTurnHandler(deps)(inbound as never, p as never, { workerId: "w" });

    expect(mocks.draft).toHaveBeenCalledTimes(1);
  });
});

describe("prévia (rascunho e Testar agente) — a régua vale também aqui", () => {
  function previa(): TurnPreview {
    return {
      kind: "sandbox",
      organizationId: ids.org,
      runId: "run-1",
      agent: assistido,
      context: {
        ok: true,
        context: { conversation_id: null, messages: [] },
      } as unknown as TurnPreview["context"],
      contactId: null,
      channelId: null,
      result: newPreviewResult(),
    };
  }

  it("assinatura vencida: impedimento declarado e o motor nem abre o banco", async () => {
    mocks.leituraDoPlano.mockResolvedValue(VENCIDA);
    const p = pool();
    const preview = previa();

    await runAgentPreview(deps, p as never, preview);

    expect(preview.result.impediments).toEqual([
      expect.objectContaining({ code: "assinatura_inativa" }),
    ]);
    expect(preview.result.candidates).toEqual([]);
    expect(p.query).not.toHaveBeenCalled();
  });

  it("controle: assinatura ativa → a prévia passa da régua", async () => {
    mocks.leituraDoPlano.mockResolvedValue(ATIVA);
    const p = pool();
    const preview = previa();

    // O resto do turno não importa aqui (o harness não o sustenta): basta que
    // ele tenha COMEÇADO — a primeira leitura depois da régua é a das camadas.
    await runAgentPreview(deps, p as never, preview).catch(() => undefined);

    expect(preview.result.impediments.map((i) => i.code)).not.toContain("assinatura_inativa");
    expect(p.query.mock.calls.some(([sql]) => String(sql).includes("org_guardrail_layers"))).toBe(
      true,
    );
  });
});
