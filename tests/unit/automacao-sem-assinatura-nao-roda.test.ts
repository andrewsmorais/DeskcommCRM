/**
 * SEM ASSINATURA ATIVA, NENHUMA REGRA DE AUTOMAÇÃO RODA.
 *
 * ═══ O achado ═══
 *
 * Com `EXIGIR_ASSINATURA=true` (o ChatAI Online), a organização sem plano ativo
 * perde a IA do WhatsApp ANTES de qualquer chamada de modelo — o turno do
 * agente (`inbound-turn.ts`) e o chatbot (`lib/chatbot/executar.ts`) aplicam a
 * régua. O motor de regras não aplicava: uma regra
 * `message.received → send_ai_message` criada no teste grátis (ou depois, pela
 * API de regras) seguia escrevendo com o modelo da chave da PLATAFORMA e
 * respondendo no número da organização que não paga. Reproduzido pela
 * auditoria: `decidirAcessoPeloPlano = {liberado:false, motivo:'vencido'}` e,
 * para a mesma organização, `runAutomationForEvent → status:'ok'`, uma chamada
 * ao provedor e um envio.
 *
 * ═══ O que se mede aqui ═══
 *
 * O MOTOR: com a assinatura vencida, nenhuma ação executa, nada é gravado em
 * `automation_rule_runs` e o motivo sai no `detail` do `skipped` (que o drain
 * preserva na linha do evento). A ação de verdade é trocada por uma espiã
 * registrada pela porta pública (`registerAction`) — o que se prova é que o
 * motor não a alcança, qualquer que seja a ação.
 *
 * Dublê só na LEITURA do plano: a decisão (`decidirAcessoPeloPlano`) roda de
 * verdade. A ação `send_ai_message` tem a sua própria conferência, provada em
 * `lib/automation/actions/send-ai-message.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventRow } from "@/lib/event-log/dispatcher";

const dubles = vi.hoisted(() => ({
  leituraDoPlano: vi.fn(),
  executar: vi.fn(),
  auditar: vi.fn(async () => undefined),
}));

vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  getOrganizationBilling: (...args: unknown[]) => dubles.leituraDoPlano(...args),
}));
vi.mock("@/lib/audit", () => ({ audit: dubles.auditar }));

import { registerAction } from "@/lib/automation/actions";
import { runAutomationForEvent } from "@/lib/automation/engine";

const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const REGRA = "11111111-0000-4000-8000-000000000001";

registerAction({ type: "acao_espia_da_assinatura", execute: dubles.executar });

/** O recorte do PostgREST que o motor usa — e o registro do que foi escrito. */
function bancoFalso() {
  const escritas: Array<{ tabela: string; acao: string }> = [];
  const from = (tabela: string) => {
    let acao = "select";
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) q[m] = () => q;
    q.insert = () => {
      acao = "insert";
      escritas.push({ tabela, acao });
      return q;
    };
    q.update = () => {
      acao = "update";
      escritas.push({ tabela, acao });
      return q;
    };
    q.maybeSingle = async () => ({
      data: tabela === "automation_rules" ? { run_count: 0 } : { id: "run-1" },
      error: null,
    });
    q.then = (resolve: (v: unknown) => unknown) => {
      if (tabela === "automation_rules" && acao === "select") {
        return Promise.resolve({
          data: [
            {
              id: REGRA,
              name: "Responder pela IA",
              conditions: [],
              actions: [{ type: "acao_espia_da_assinatura", config: {} }],
            },
          ],
          error: null,
        }).then(resolve);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    return q;
  };
  return { cliente: { from } as unknown as SupabaseClient, escritas };
}

const EVENTO: EventRow = {
  id: "evento-1",
  organization_id: ORG,
  event_type: "message.received",
  entity_kind: "message",
  entity_id: "mensagem-1",
  payload: {},
  metadata: {},
  consumed_by: [],
  attempts: 0,
} as unknown as EventRow;

beforeEach(() => {
  vi.clearAllMocks();
  dubles.executar.mockResolvedValue({ type: "acao_espia_da_assinatura", status: "success" });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("motor de automação — a régua da assinatura", () => {
  it("assinatura vencida: nenhuma ação executa e o motivo aparece no skipped", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    dubles.leituraDoPlano.mockResolvedValue({
      ok: true,
      billing: { is_active: false, plan_slug: "essencial", status: "past_due" },
    });
    const { cliente, escritas } = bancoFalso();

    const r = await runAutomationForEvent(cliente, EVENTO);

    expect(r).toEqual({
      consumer_key: "automation-rules",
      status: "skipped",
      detail: "assinatura_vencido",
    });
    expect(dubles.leituraDoPlano).toHaveBeenCalledWith(ORG);
    expect(dubles.executar).not.toHaveBeenCalled();
    expect(escritas).toEqual([]);
  });

  it("organização sem plano nenhum: também não roda", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    dubles.leituraDoPlano.mockResolvedValue({ ok: true, billing: null });
    const { cliente } = bancoFalso();

    const r = await runAutomationForEvent(cliente, EVENTO);

    expect(r.detail).toBe("assinatura_sem_plano");
    expect(dubles.executar).not.toHaveBeenCalled();
  });

  it("anti-vacuidade: assinatura ativa roda a regra e grava o run", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    dubles.leituraDoPlano.mockResolvedValue({
      ok: true,
      billing: { is_active: true, plan_slug: "essencial", status: "active" },
    });
    const { cliente, escritas } = bancoFalso();

    const r = await runAutomationForEvent(cliente, EVENTO);

    expect(r.status).toBe("ok");
    expect(dubles.executar).toHaveBeenCalledTimes(1);
    expect(escritas).toContainEqual({ tabela: "automation_rule_runs", acao: "insert" });
  });

  it("leitura do plano indisponível LIBERA — um soluço do banco não cala quem paga", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    dubles.leituraDoPlano.mockResolvedValue({ ok: false, reason: "consulta_indisponivel" });
    const { cliente } = bancoFalso();

    await runAutomationForEvent(cliente, EVENTO);

    expect(dubles.executar).toHaveBeenCalledTimes(1);
  });

  it("instalação que não vende planos não lê o plano a cada evento", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "false");
    const { cliente } = bancoFalso();

    await runAutomationForEvent(cliente, EVENTO);

    expect(dubles.leituraDoPlano).not.toHaveBeenCalled();
    expect(dubles.executar).toHaveBeenCalledTimes(1);
  });
});
