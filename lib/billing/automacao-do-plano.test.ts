import { describe, expect, it } from "vitest";

import { regraUsaAutomacaoAvancada } from "./automacao-do-plano";

describe("automação avançada (Impulso em diante)", () => {
  it("gatilho de ganho ou perda é avançado", () => {
    expect(regraUsaAutomacaoAvancada({ trigger_event: "lead.won", actions: [] })).toBe(true);
    expect(regraUsaAutomacaoAvancada({ trigger_event: "lead.lost", actions: [] })).toBe(true);
  });

  it("IA, e-mail, aviso à equipe e mídia são avançados", () => {
    for (const type of ["send_ai_message", "send_email", "notify_team"]) {
      expect(regraUsaAutomacaoAvancada({ trigger_event: "lead.created", actions: [{ type }] })).toBe(true);
    }
    expect(
      regraUsaAutomacaoAvancada({
        trigger_event: "lead.created",
        actions: [{ type: "send_whatsapp_message", config: { media_url: "https://x/a.jpg" } }],
      }),
    ).toBe(true);
  });

  it("mensagem de texto, etiqueta e tarefa continuam em todos os planos", () => {
    expect(
      regraUsaAutomacaoAvancada({
        trigger_event: "lead.created",
        actions: [
          { type: "send_whatsapp_message", config: { media_url: "  " } },
          { type: "add_tag" },
          { type: "create_task" },
        ],
      }),
    ).toBe(false);
  });
});
