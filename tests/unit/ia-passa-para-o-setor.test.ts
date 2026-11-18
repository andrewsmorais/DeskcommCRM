/**
 * O7, fatia 4 — a IA passa a conversa para um SETOR (`crm_set_conversation_sector`).
 *
 * Mede a borda da ferramenta: o setor é achado pelo NOME (sem diferenciar
 * maiúsculas) ou pelo id, dentro da organização do contexto; nome desconhecido
 * devolve os setores disponíveis (para o modelo corrigir); a transferência usa a
 * MESMA régua do botão e do chatbot (`transferirParaSetor`) e audita.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  transferir: vi.fn(),
  auditar: vi.fn(),
  filtros: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/setores/servico", () => ({ transferirParaSetor: estado.transferir }));
vi.mock("@/lib/audit", () => ({ audit: estado.auditar }));

import { crmSetConversationSector } from "@/lib/mcp/tools/governance";
import type { McpContext } from "@/lib/mcp/types";

const ORG = "77777777-0000-4000-8000-000000000001";
const CONVERSA = "77777777-1111-4000-8000-000000000001";
const FINANCEIRO = "77777777-2222-4000-8000-000000000001";
const SUPORTE = "77777777-2222-4000-8000-000000000002";

function ctx(setores: Array<{ id: string; nome: string }>): McpContext {
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => {
      estado.filtros.push([c, v]);
      return q;
    },
    then: (ok: (r: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: setores, error: null }).then(ok),
  };
  return {
    organizationId: ORG,
    actor: { type: "ai_agent", id: "agente-1" },
    requestId: "req-1",
    supabase: { from: () => q },
  } as unknown as McpContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.filtros = [];
  estado.transferir.mockResolvedValue({ ok: true, soltouDono: false, setorAnterior: null });
});

describe("crm_set_conversation_sector", () => {
  const setores = [
    { id: FINANCEIRO, nome: "Financeiro" },
    { id: SUPORTE, nome: "Suporte" },
  ];

  it("acha o setor pelo nome, sem diferenciar maiúsculas, e transfere dentro da organização", async () => {
    const r = await crmSetConversationSector.handler(
      { conversation_id: CONVERSA, setor: "  financeiro " },
      ctx(setores),
    );
    expect(estado.filtros).toContainEqual(["organization_id", ORG]);
    expect(estado.transferir).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      conversationId: CONVERSA,
      setorId: FINANCEIRO,
    });
    expect(r).toMatchObject({ setor_id: FINANCEIRO, setor: "Financeiro" });
    expect(estado.auditar).toHaveBeenCalledWith(
      expect.objectContaining({ action: "conversation.setor_changed", organizationId: ORG }),
    );
  });

  it("aceita o id do setor", async () => {
    await crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: SUPORTE }, ctx(setores));
    expect(estado.transferir).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ setorId: SUPORTE }));
  });

  it("nome desconhecido não transfere e diz quais setores existem", async () => {
    await expect(
      crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Jurídico" }, ctx(setores)),
    ).rejects.toThrow(/setor_nao_encontrado.*Financeiro, Suporte/);
    expect(estado.transferir).not.toHaveBeenCalled();
    expect(estado.auditar).not.toHaveBeenCalled();
  });

  it("empresa sem setores: recusa com motivo, sem efeito", async () => {
    await expect(
      crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Financeiro" }, ctx([])),
    ).rejects.toThrow(/sem_setores/);
    expect(estado.transferir).not.toHaveBeenCalled();
  });

  it("conversa de outra organização (não achada) não vira sucesso mudo", async () => {
    estado.transferir.mockResolvedValue({ ok: false, erro: "conversa_nao_encontrada" });
    await expect(
      crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Suporte" }, ctx(setores)),
    ).rejects.toThrow("conversa_nao_encontrada");
    expect(estado.auditar).not.toHaveBeenCalled();
  });
});
