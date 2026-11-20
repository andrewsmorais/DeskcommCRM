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
  fronteira: null as { conversation_id: string } | null,
}));

vi.mock("@/lib/setores/servico", () => ({ transferirParaSetor: estado.transferir }));
vi.mock("@/lib/audit", () => ({ audit: estado.auditar }));
vi.mock("@/lib/atendimento/fronteira-server", () => ({ currentExecutionBoundary: () => estado.fronteira }));

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
  estado.fronteira = null;
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

/**
 * Auditoria de 18/11, achado 6: o `conversation_id` vem do modelo, e o modelo
 * lê o texto do cliente. Num turno, a ferramenta só mexe na conversa DESTE
 * atendimento — a mesma prisão ao turno das ferramentas de agenda.
 */
describe("crm_set_conversation_sector preso ao turno", () => {
  const CONTATO_DO_TURNO = "77777777-3333-4000-8000-000000000001";
  const OUTRO_CONTATO = "77777777-3333-4000-8000-000000000002";
  const setores = [{ id: FINANCEIRO, nome: "Financeiro" }];

  function ctxDoTurno(donoDaConversa: string | null): McpContext {
    const base = ctx(setores);
    const conversa = {
      select: () => conversa,
      eq: () => conversa,
      maybeSingle: async () => ({
        data: donoDaConversa ? { contact_id: donoDaConversa } : null,
        error: null,
      }),
    };
    const setoresQ = (base.supabase as unknown as { from: (t: string) => unknown }).from("setores");
    return {
      ...base,
      turnContactId: CONTATO_DO_TURNO,
      supabase: { from: (t: string) => (t === "conversations" ? conversa : setoresQ) },
    } as unknown as McpContext;
  }

  it("conversa de OUTRO contato: recusa legível, sem transferir nem auditar", async () => {
    await expect(
      crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Financeiro" }, ctxDoTurno(OUTRO_CONTATO)),
    ).rejects.toThrow(/conversa_fora_do_atendimento/);
    expect(estado.transferir).not.toHaveBeenCalled();
    expect(estado.auditar).not.toHaveBeenCalled();
  });

  it("conversa que não existe na organização: mesma recusa", async () => {
    await expect(
      crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Financeiro" }, ctxDoTurno(null)),
    ).rejects.toThrow(/conversa_fora_do_atendimento/);
    expect(estado.transferir).not.toHaveBeenCalled();
  });

  it("conversa do contato do turno: transfere como antes", async () => {
    await crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Financeiro" }, ctxDoTurno(CONTATO_DO_TURNO));
    expect(estado.transferir).toHaveBeenCalledOnce();
  });

  it("com a fronteira do atendimento em execução, vale a conversa EXATA dela", async () => {
    estado.fronteira = { conversation_id: "77777777-1111-4000-8000-000000000099" };
    await expect(
      crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Financeiro" }, ctx(setores)),
    ).rejects.toThrow(/conversa_fora_do_atendimento/);
    expect(estado.transferir).not.toHaveBeenCalled();

    estado.fronteira = { conversation_id: CONVERSA };
    await crmSetConversationSector.handler({ conversation_id: CONVERSA, setor: "Financeiro" }, ctx(setores));
    expect(estado.transferir).toHaveBeenCalledOnce();
  });
});
