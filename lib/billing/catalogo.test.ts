import { describe, expect, it } from "vitest";

import { PLANOS_COMERCIAIS, limitesEfetivos, planoInclui } from "./catalogo";

/**
 * A promessa dos cards da página de vendas (27/10/2026). Se um destes números
 * mudar, a página (andrewsmorais/Qwen) muda junto — senão o CRM entrega uma
 * coisa e a página promete outra.
 */
describe("catálogo = cards da página de vendas", () => {
  it("Essencial: 2 números, 1 agente, 1 chatbot, 2 funis, 2 usuários", () => {
    expect(limitesEfetivos("essencial", null)).toEqual({
      whatsapp: 2,
      agentes_ia: 1,
      chatbots: 1,
      pipelines: 2,
      usuarios: 2,
    });
  });
  it("Impulso: 4 números, 2 agentes, 2 chatbots, 4 funis, 4 usuários", () => {
    expect(limitesEfetivos("impulso", null)).toEqual({
      whatsapp: 4,
      agentes_ia: 2,
      chatbots: 2,
      pipelines: 4,
      usuarios: 4,
    });
  });
  it("Escala: pacote base 6/3/3/6/6", () => {
    expect(limitesEfetivos("escala", null)).toEqual({
      whatsapp: 6,
      agentes_ia: 3,
      chatbots: 3,
      pipelines: 6,
      usuarios: 6,
    });
  });

  it("recursos do Impulso não vêm no Essencial; os do Escala não vêm no Impulso", () => {
    for (const r of [
      "chatbot_avancado",
      "follow_up",
      "organizar_crm",
      "comandas_e_propostas",
      "skills",
      "api",
      "webhooks",
      "distribuicao_automatica",
      "relatorios_completos",
    ] as const) {
      expect(planoInclui("essencial", r), r).toBe(false);
      expect(planoInclui("impulso", r), r).toBe(true);
    }
    for (const r of [
      "distribuicao_avancada",
      "permissoes_avancadas",
      "auditoria",
      "multimarca",
    ] as const) {
      expect(planoInclui("impulso", r), r).toBe(false);
      expect(planoInclui("escala", r), r).toBe(true);
    }
    expect(planoInclui("essencial", "agendamentos")).toBe(true);
  });
});

describe("proposta do Escala (limites_personalizados)", () => {
  it("sobe os números da proposta", () => {
    expect(
      limitesEfetivos("escala", {
        whatsapp: 10,
        agentes_ia: 5,
        chatbots: 4,
        pipelines: 12,
        usuarios: 15,
      }),
    ).toEqual({ whatsapp: 10, agentes_ia: 5, chatbots: 4, pipelines: 12, usuarios: 15 });
  });
  it("nunca fica abaixo do pacote base, e lixo vale o pacote base", () => {
    expect(
      limitesEfetivos("escala", { whatsapp: 1, agentes_ia: -1, chatbots: "9", pipelines: 2.5 }),
    ).toEqual({ ...limitesEfetivos("escala", null) });
  });
  it("é ignorada fora do Escala", () => {
    expect(limitesEfetivos("essencial", { whatsapp: 50 }).whatsapp).toBe(
      PLANOS_COMERCIAIS.essencial.whatsapp,
    );
  });
});
