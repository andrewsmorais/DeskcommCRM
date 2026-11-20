/**
 * Inscrição AUTOMÁTICA em follow-up exige o "Follow-up automático" do plano.
 *
 * Achado da auditoria de 04/11/2026: a varredura de silêncio (e os gatilhos de
 * etapa, negócio criado, caso e retorno) inscreviam contatos sem ler o plano.
 * No Essencial — onde só o chatbot inscreve —, um gerente trocava o gatilho de
 * um fluxo publicado para silêncio, a varredura inscrevia todo contato calado,
 * e ao voltar o gatilho para manual o motor soltava os envios. Todos esses
 * produtores passam por `decidirAgenteDoEnrollmentAutomatico`; a trava mora lá.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const plano = vi.hoisted(() => ({
  resposta: { ok: true } as
    { ok: true } | { ok: false; code: string; status: number; message: string },
}));

vi.mock("@/lib/billing/acesso", () => ({
  verificarRecursoDoPlano: vi.fn(async () => plano.resposta),
}));

import { decidirAgenteDoEnrollmentAutomatico } from "@/lib/followup/agent-followup-gate";

const ORG = "11111111-1111-4111-8111-111111111111";
const POINTER = "22222222-2222-4222-8222-222222222222";
const AGENTE = "a0000000-0000-4000-8000-000000000000";
const db = {
  async loadEnabledPublishedFollowupAgents() {
    return [{ agentId: AGENTE, pointerIds: [POINTER] }];
  },
};

beforeEach(() => {
  plano.resposta = { ok: true };
});

describe("decidirAgenteDoEnrollmentAutomatico — o plano", () => {
  it("sem o Follow-up automático, a inscrição automática é barrada (mesmo fluxo de texto)", async () => {
    plano.resposta = {
      ok: false,
      code: "billing_feature",
      status: 403,
      message: "Follow-up automático é do Impulso.",
    };
    expect(await decidirAgenteDoEnrollmentAutomatico(db, ORG, POINTER, false)).toEqual({
      agentId: null,
      barrado: true,
    });
  });

  it("plano ilegível não é motivo novo de parar (só billing_feature barra)", async () => {
    plano.resposta = { ok: false, code: "billing_unavailable", status: 503, message: "..." };
    expect(await decidirAgenteDoEnrollmentAutomatico(db, ORG, POINTER, true)).toEqual({
      agentId: AGENTE,
      barrado: false,
    });
  });

  it("controle: com o recurso, segue a regra do agente de sempre", async () => {
    expect(await decidirAgenteDoEnrollmentAutomatico(db, ORG, POINTER, true)).toEqual({
      agentId: AGENTE,
      barrado: false,
    });
  });
});
