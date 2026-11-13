/**
 * A régua das mensagens agendadas (migration 0511): o que a tela e as rotas
 * aceitam antes de qualquer banco.
 */
import { describe, expect, it } from "vitest";

import { agendadaSchema, problemaDoHorario } from "./regras";

const AGORA = new Date("2026-11-13T12:00:00Z");

describe("horário do agendamento", () => {
  it("pelo menos 1 minuto à frente, até um ano", () => {
    expect(problemaDoHorario("2026-11-13T12:00:30Z", AGORA)).toMatch(/1 minuto/);
    expect(problemaDoHorario("2026-11-13T11:00:00Z", AGORA)).toMatch(/1 minuto/);
    expect(problemaDoHorario("2026-11-13T12:02:00Z", AGORA)).toBeNull();
    expect(problemaDoHorario("2027-11-12T12:00:00Z", AGORA)).toBeNull();
    expect(problemaDoHorario("2028-01-01T12:00:00Z", AGORA)).toMatch(/um ano/);
    expect(problemaDoHorario("ontem", AGORA)).toMatch(/inválida/);
  });
});

describe("o pedido", () => {
  const quando = "2026-11-14T09:00:00-03:00";
  it("mensagem e nota precisam de texto; chatbot precisa do fluxo", () => {
    expect(agendadaSchema.safeParse({ tipo: "mensagem", texto: "Oi", enviar_em: quando }).success).toBe(true);
    expect(agendadaSchema.safeParse({ tipo: "nota", texto: "  ", enviar_em: quando }).success).toBe(false);
    expect(agendadaSchema.safeParse({ tipo: "chatbot", enviar_em: quando }).success).toBe(false);
    expect(
      agendadaSchema.safeParse({
        tipo: "chatbot",
        chatbot_flow_id: "f9a9a9a9-2222-4000-8000-000000000001",
        enviar_em: quando,
      }).success,
    ).toBe(true);
  });

  it("horário sem fuso é recusado (a tela manda sempre com fuso)", () => {
    expect(agendadaSchema.safeParse({ tipo: "nota", texto: "x", enviar_em: "2026-11-14T09:00" }).success).toBe(false);
  });
});
