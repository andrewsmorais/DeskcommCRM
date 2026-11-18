// @vitest-environment node
/**
 * Ganho e perda do negócio como GATILHO de regra (S5 — "webhook de ganho e perda").
 *
 * O trigger de banco grava `lead.won`/`lead.lost` com entidade `lead` (e é o único
 * emissor). O gatilho tem que: estar na fonte única, ser assinado pelo motor, aceitar
 * a entidade `lead` e hidratar negócio + contato no contexto — que é de onde o
 * `call_webhook` tira o envelope.
 *
 * SABOTAGEM: tirar as duas linhas de `ENTIDADE_ESPERADA_POR_GATILHO`, ou a entidade
 * `lead` de `buildContext`, deixa este arquivo vermelho.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { buildContext, runAutomationForEvent } from "@/lib/automation/engine";
import { automationRulesHandler } from "@/lib/automation/engine.handler";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { ENTIDADE_ESPERADA_POR_GATILHO } from "@/lib/schemas/webhooks";

const ORG = "00000000-0000-4000-8000-000000000001";
const LEAD = "00000000-0000-4000-8000-0000000000a1";
const CONTATO = "00000000-0000-4000-8000-0000000000c1";

const tabelas: Record<string, Record<string, unknown>> = {
  crm_leads: { id: LEAD, organization_id: ORG, contact_id: CONTATO, status: "won", title: "Plano anual" },
  contacts: { id: CONTATO, organization_id: ORG, name: "Ana" },
};

function admin(consultadas: string[] = []) {
  return {
    from(tabela: string) {
      const qb: Record<string, unknown> = {};
      qb.select = () => qb;
      qb.eq = () => qb;
      qb.order = () => qb;
      qb.maybeSingle = async () => ({ data: tabelas[tabela] ?? null, error: null });
      qb.then = (ok: (v: unknown) => unknown) => {
        consultadas.push(tabela);
        return Promise.resolve({ data: [], error: null }).then(ok);
      };
      return qb;
    },
  } as unknown as SupabaseClient;
}

function evento(tipo: string, entidade: string): EventRow {
  return {
    id: "evt-1",
    organization_id: ORG,
    event_type: tipo,
    entity_kind: entidade,
    entity_id: LEAD,
    payload: { lead_id: LEAD },
    metadata: {},
    created_at: "2026-11-18T12:00:00Z",
  } as unknown as EventRow;
}

describe("lead.won / lead.lost como gatilho", () => {
  it("estão na fonte única, com a entidade que o trigger de banco grava", () => {
    expect(ENTIDADE_ESPERADA_POR_GATILHO["lead.won"]).toBe("lead");
    expect(ENTIDADE_ESPERADA_POR_GATILHO["lead.lost"]).toBe("lead");
  });

  it("o motor assina os dois eventos", () => {
    expect(automationRulesHandler.events).toEqual(expect.arrayContaining(["lead.won", "lead.lost"]));
  });

  it("hidrata o negócio e o contato quando a entidade é `lead`", async () => {
    const ctx = await buildContext(admin(), evento("lead.won", "lead"));
    expect((ctx.lead as { id: string }).id).toBe(LEAD);
    expect((ctx.contact as { name: string }).name).toBe("Ana");
  });

  it("aceita a entidade `lead` e recusa outra (sem rodar a regra duas vezes)", async () => {
    const certo = await runAutomationForEvent(admin(), evento("lead.lost", "lead"));
    expect(certo.detail).toBe("no_rules");
    const errado = await runAutomationForEvent(admin(), evento("lead.lost", "contact"));
    expect(errado.detail).toBe("entity_kind_mismatch");
  });
});
