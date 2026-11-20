/**
 * A IA NUM TURNO DE CONVERSA SÓ MEXE NO COMPROMISSO DE QUEM ESTÁ FALANDO.
 *
 * Cancelar, remarcar e confirmar recebem um `appointment_id` escolhido pelo
 * modelo, e o handler da agenda carregava o compromisso só por organização +
 * id. A listagem devolvia os ids da agenda inteira. O contato A, conversando,
 * levava a IA a desmarcar o horário do contato B — com a identidade da
 * organização.
 *
 * O contato do turno chega pelo runtime (`McpContext.turnContactId`), nunca
 * pelos argumentos. Os casos rodam as tools de verdade sobre o handler de
 * verdade; o banco é um dublê que registra se alguma escrita foi tentada.
 */
import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as AgendaConsulta from "@/lib/agenda/consulta";
import type { McpContext } from "@/lib/mcp/types";

vi.mock("@/lib/agenda/consulta", async (original) => ({
  ...(await original<typeof AgendaConsulta>()),
  listaAgendamentos: vi.fn(async () => ({ ok: true, agendamentos: [], proximo: null })),
}));

const { listaAgendamentos } = await import("@/lib/agenda/consulta");
const {
  crmCancelAppointment,
  crmConfirmAppointment,
  crmRescheduleAppointment,
  crmListAppointments,
} = await import("@/lib/mcp/tools/agendamento");

const CONTATO_A = "00000000-0000-4000-8000-0000000000aa";
const CONTATO_B = "00000000-0000-4000-8000-0000000000bb";
const COMPROMISSO_DE_B = "00000000-0000-4000-8000-00000000c0bb";

const escritas: string[] = [];

/** Banco de mentira: o compromisso é do contato B; toda escrita fica registrada. */
function banco(): SupabaseClient {
  const consulta = (tabela: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "neq", "order", "limit", "gte", "lte", "lt", "gt"])
      q[m] = () => q;
    for (const m of ["update", "insert", "upsert", "delete"])
      q[m] = () => {
        escritas.push(`${m}:${tabela}`);
        return q;
      };
    q.maybeSingle = async () => ({
      data:
        tabela === "calendar_appointments"
          ? {
              id: COMPROMISSO_DE_B,
              revision: 1,
              event_type_id: "tipo-1",
              owner_user_id: "dono-1",
              contact_id: CONTATO_B,
              starts_at: "2026-11-20T13:00:00Z",
              status: "pending",
              time_zone: "America/Sao_Paulo",
            }
          : null,
      error: null,
    });
    q.single = q.maybeSingle;
    q.then = (ok: (r: unknown) => unknown) => ok({ data: [], error: null });
    return q;
  };
  return {
    from: consulta,
    rpc: async (fn: string) => {
      escritas.push(`rpc:${fn}`);
      return { data: null, error: { message: "dublê não grava" } };
    },
  } as unknown as SupabaseClient;
}

const ctxDoTurno = (): McpContext => ({
  organizationId: "org-1",
  role: "ai_operator",
  actor: { type: "ai_agent", id: "run-1", agent_id: "ag-1", role: "ai_operator" },
  apiTokenId: "tok-1",
  requestId: "req-1",
  supabase: banco(),
  turnContactId: CONTATO_A,
});

beforeEach(() => {
  escritas.length = 0;
  vi.mocked(listaAgendamentos).mockClear();
});

describe("turno do contato A contra o compromisso do contato B", () => {
  it("cancelar é recusado, e nada é escrito", async () => {
    const r = await crmCancelAppointment.handler(
      { appointment_id: COMPROMISSO_DE_B, reason: "o cliente pediu" },
      ctxDoTurno(),
    );
    expect(r).toMatchObject({ cancelado: false, motivo: "appointment_de_outro_contato" });
    expect(escritas).toEqual([]);
  });

  it("remarcar é recusado, e nada é escrito", async () => {
    const r = await crmRescheduleAppointment.handler(
      { appointment_id: COMPROMISSO_DE_B, new_starts_at: "2026-11-21T13:00:00Z" },
      ctxDoTurno(),
    );
    expect(r).toMatchObject({ remarcado: false, motivo: "appointment_de_outro_contato" });
    expect(escritas).toEqual([]);
  });

  it("confirmar é recusado, e nada é escrito", async () => {
    const r = await crmConfirmAppointment.handler(
      { appointment_id: COMPROMISSO_DE_B },
      ctxDoTurno(),
    );
    expect(r).toMatchObject({ confirmado: false, motivo: "appointment_de_outro_contato" });
    expect(escritas).toEqual([]);
  });
});

describe("a listagem no turno só mostra a agenda de quem está falando", () => {
  it("o período inteiro e o contact_id de outro viram a agenda do contato do turno", async () => {
    await crmListAppointments.handler(
      { de: "2026-11-01T00:00:00Z", ate: "2026-11-07T00:00:00Z", contact_id: CONTATO_B },
      ctxDoTurno(),
    );
    expect(vi.mocked(listaAgendamentos).mock.calls[0]![2]).toMatchObject({ contactId: CONTATO_A });
  });
});

describe("o contato do turno vem do runtime, não dos argumentos", () => {
  it("os dois runtimes que montam as tools põem o contato da conversa no contexto", () => {
    const engine = readFileSync("lib/agent-engine/edge/crm/mcp-tools.ts", "utf8");
    expect(engine).toMatch(/turnContactId: ids\.contactId/);
    const legado = readFileSync("lib/ai/runtime/agent.ts", "utf8");
    expect(legado).toMatch(/turnContactId: run\.contact_id/);
  });
});
