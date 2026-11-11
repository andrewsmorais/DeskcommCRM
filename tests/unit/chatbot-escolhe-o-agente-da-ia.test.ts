/**
 * "Transferir p/ agentes de IA" com agente escolhido: o turno da IA usa ESSE
 * agente, acima do roteador do número (degrau 0b, logo abaixo da campanha).
 *
 * Antes não dava para escolher: ia o agente do número ou o roteador (auditoria
 * funcional do chatbot, card 58). Agente sem versão publicada: régua normal.
 */
import { describe, expect, it, vi } from "vitest";

import { resolveTurnAgent } from "@/lib/agent-engine/agent/resolve-turn-agent";

const entrada = {
  tenantId: "org-1",
  leadId: "lead-1",
  jobId: "job-1",
  channelSessionId: "sess-1",
  conversationId: "conv-1",
  inbound: true,
  signal: "quero comprar",
  signalMessageId: "m-1",
  recentMessages: [],
  stickyAgentId: null,
  stickyIntent: null,
};

function deps(opts: { escolhido: string | null; publicado: boolean }) {
  const loadPublishedAgentConfigById = vi.fn(async (_db: unknown, _org: string, id: string) =>
    opts.publicado || id !== opts.escolhido ? ({ agentId: id } as never) : null,
  );
  const loadActiveRouter = vi.fn(async () => null);
  const loadPublishedAgentConfig = vi.fn(async () => ({ agentId: "agente-do-numero" }) as never);
  return {
    loadPublishedAgentConfigById,
    loadActiveRouter,
    d: {
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      agenteDaCampanha: vi.fn(async () => null),
      agenteDoChatbot: vi.fn(async () => opts.escolhido),
      loadActiveRouter,
      loadPublishedAgentConfigById,
      loadPublishedAgentConfig,
      classifyIntent: vi.fn(),
    } as never,
  };
}

describe("agente escolhido pelo chatbot", () => {
  it("vale acima do agente do número e do roteador", async () => {
    const { d, loadActiveRouter } = deps({ escolhido: "agente-vendas", publicado: true });
    const r = await resolveTurnAgent({} as never, {} as never, entrada, d);
    expect(r.outcome).toBe("chatbot");
    expect(r.config).toEqual({ agentId: "agente-vendas" });
    expect(loadActiveRouter).not.toHaveBeenCalled();
  });

  it("sem versão publicada: segue a régua do número", async () => {
    const { d } = deps({ escolhido: "agente-vendas", publicado: false });
    const r = await resolveTurnAgent({} as never, {} as never, entrada, d);
    expect(r.outcome).toBe("no_router");
    expect(r.config).toEqual({ agentId: "agente-do-numero" });
  });

  it("controle: sem escolha, nada muda", async () => {
    const { d } = deps({ escolhido: null, publicado: true });
    const r = await resolveTurnAgent({} as never, {} as never, entrada, d);
    expect(r.outcome).toBe("no_router");
  });
});
