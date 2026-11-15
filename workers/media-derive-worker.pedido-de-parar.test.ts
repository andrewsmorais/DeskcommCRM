/**
 * Pedido de parar dito em áudio: a transcrição abre UM aviso na Central por
 * conversa e nunca bloqueia sozinha.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import {
  avisarPedidoDeParaEmAudio,
  TITULO_DO_AVISO_DE_PARAR_EM_AUDIO,
  transcricaoPedeParar,
} from "./media-derive-worker.pedido-de-parar";

function adminFalso(abertos: unknown[] = []) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const admin = {
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = () => Promise.resolve({ data: abertos, error: null });
      chain.insert = (linha: unknown) => {
        inserts.push({ tabela, linha });
        return Promise.resolve({ error: null });
      };
      chain.update = (linha: unknown) => {
        updates.push({ tabela, linha });
        return chain;
      };
      return chain;
    },
  };
  return { admin: admin as never, inserts, updates };
}

const BASE = { organizationId: "org-a", conversationId: "conv-1" };

describe("pedido de parar dito em áudio", () => {
  it("frase de saída abre o aviso apontando a conversa, sem tocar no contato", async () => {
    const f = adminFalso();
    expect(await avisarPedidoDeParaEmAudio(f.admin, { ...BASE, transcricao: "Não quero mais receber mensagem de vocês" })).toBe(true);
    expect(f.inserts).toHaveLength(1);
    expect(f.inserts[0]).toMatchObject({
      tabela: "agent_inbox_items",
      linha: { organization_id: "org-a", kind: "other", title: TITULO_DO_AVISO_DE_PARAR_EM_AUDIO, ref_kind: "conversation", ref_id: "conv-1" },
    });
    expect(f.updates).toHaveLength(0);
  });

  it("aviso já aberto para a conversa não abre outro", async () => {
    const f = adminFalso([{ id: "aviso-1" }]);
    await avisarPedidoDeParaEmAudio(f.admin, { ...BASE, transcricao: "parar" });
    expect(f.inserts).toHaveLength(0);
  });

  it("áudio comum não avisa nada", async () => {
    const f = adminFalso();
    expect(await avisarPedidoDeParaEmAudio(f.admin, { ...BASE, transcricao: "Oi, queria saber o preço do bolo de 2 quilos" })).toBe(false);
    expect(f.inserts).toHaveLength(0);
    expect(transcricaoPedeParar("tem como parar a dor?")).toBe(false);
  });
});
