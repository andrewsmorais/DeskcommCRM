import { describe, expect, it } from "vitest";
import { MARCA_DE_ESCALAR, parteDoCliente, parteFixa } from "@/lib/ajuda/prompt";
import { PLANOS_COMERCIAIS } from "@/lib/billing/catalogo";

describe("prompt do assistente de ajuda", () => {
  const fixa = parteFixa("ChatAI Online");

  it("traz os números de cada plano do catálogo", () => {
    for (const p of Object.values(PLANOS_COMERCIAIS)) {
      expect(fixa).toContain(`- ${p.nome}: ${p.whatsapp} números de WhatsApp`);
    }
  });

  it("traz toda tela e o marcador de escalar", () => {
    expect(fixa).toContain("(/app/ai/agents)");
    expect(fixa).toContain("(/app/connections)");
    expect(fixa).toContain(MARCA_DE_ESCALAR);
    expect(fixa).toContain("## Como escrever o prompt");
  });

  it("a parte do cliente diz plano, papel, telas e contato", () => {
    const c = parteDoCliente({
      marca: "ChatAI Online",
      plano: "impulso",
      status: "trialing",
      limites: { whatsapp: 4, pipelines: 4, agentes_ia: 2, chatbots: 2, usuarios: 4 },
      papel: "admin",
      telasVisiveis: [{ href: "/app/inbox", label: "Conversas" }],
      contato: { email: "suporte@x.com", whatsapp: "5512981667389" },
    });
    expect(c).toContain("Impulso (em teste grátis)");
    expect(c).toContain("Administrador");
    expect(c).toContain("Conversas (/app/inbox)");
    expect(c).toContain("+5512981667389");
  });
});
