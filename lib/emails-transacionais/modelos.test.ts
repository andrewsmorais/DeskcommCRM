import { describe, expect, it } from "vitest";
import { PLANOS_COMERCIAIS, RECURSOS_DO_PLANO } from "@/lib/billing/catalogo";
import type { MarcaDeSaida } from "@/lib/branding/saida";
import {
  EXCLUSIVOS_DO_ESCALA,
  montarBoasVindas,
  montarEscalaAtivo,
  montarPlanoContratado,
  montarPlanoMelhorado,
  montarPlanoReduzido,
  montarReembolso,
  limitesDoPlano,
} from "@/lib/emails-transacionais/modelos";

const marca = {
  nome: "ChatAI Online",
  logoUrl: null,
  accent: "#2563eb",
  accentFg: "#ffffff",
  origens: { nome: "padrao", cor: "padrao" },
} as unknown as MarcaDeSaida;

const resumo = { ciclo: "monthly" as const, valorEmCentavos: 19700, proximaCobranca: null };
const url = "https://crm.exemplo.com";

describe("e-mails de relacionamento", () => {
  it("as boas-vindas citam o agente de IA e o chatbot", () => {
    const e = montarBoasVindas({ marca, nome: "Ana", emTeste: true, urlDoApp: url });
    expect(e.text.toLowerCase()).toContain("chatbot");
    expect(e.text.toLowerCase()).toContain("agente");
    expect(e.subject).toContain("Ana");
  });

  it("os limites do e-mail vêm do catálogo", () => {
    for (const plano of ["essencial", "impulso"] as const) {
      const lim = PLANOS_COMERCIAIS[plano];
      const e = montarPlanoContratado({ marca, nome: null, plano, resumo, urlDoApp: url });
      expect(limitesDoPlano(plano).join(" ")).toContain(String(lim.agentes_ia));
      expect(e.text).toContain(String(lim.usuarios));
    }
  });

  it("melhorado e reduzido citam o chatbot e nenhum template deixa chave sem trocar", () => {
    const all = [
      montarBoasVindas({ marca, nome: "Ana", emTeste: false, urlDoApp: url }),
      montarPlanoContratado({ marca, nome: "Ana", plano: "essencial", resumo, urlDoApp: url }),
      montarPlanoMelhorado({
        marca,
        nome: "Ana",
        plano: "impulso",
        anterior: "essencial",
        resumo,
        urlDoApp: url,
      }),
      montarPlanoReduzido({
        marca,
        nome: "Ana",
        plano: "essencial",
        anterior: "impulso",
        resumo,
        urlDoApp: url,
      }),
      montarReembolso({ marca, nome: "Ana", valorEmCentavos: 19700, forma: "PIX" }),
    ];
    for (const e of all) {
      expect(e.html).not.toMatch(/\{[a-zA-Z_]+\}|undefined|null/);
      expect(e.text).not.toMatch(/\{[a-zA-Z_]+\}|undefined/);
    }
    expect(all[2]!.text.toLowerCase()).toContain("chatbot");
    expect(all[3]!.text.toLowerCase()).toContain("chatbot");
  });

  it("os exclusivos do Escala são mesmo do Escala no catálogo", () => {
    for (const e of EXCLUSIVOS_DO_ESCALA) expect(RECURSOS_DO_PLANO[e.recurso].desde).toBe("escala");
  });

  it("Escala sem contato configurado não mostra linha vazia", () => {
    const e = montarEscalaAtivo({
      marca,
      nome: null,
      limites: { whatsapp: 6, pipelines: 6, agentes_ia: 3, chatbots: 3, usuarios: 6 },
      urlDoApp: url,
      contato: { email: "", whatsapp: "" },
    });
    expect(e.text).not.toContain("WhatsApp: ");
    expect(e.text).not.toContain("E-mail: ");
    expect(e.text).toContain("3 agentes de IA e 3 chatbots");
    expect(e.html).not.toMatch(/undefined|null/);
  });

  it("escapa o nome da pessoa", () => {
    const e = montarBoasVindas({
      marca,
      nome: "<script>alert(1)</script>",
      emTeste: false,
      urlDoApp: url,
    });
    expect(e.html).not.toContain("<script>");
  });

  it("o reembolso mostra só o prazo da forma de pagamento usada", () => {
    const e = montarReembolso({ marca, nome: null, valorEmCentavos: 19700, forma: "PIX" });
    expect(e.text).toContain("Pix");
    expect(e.text).not.toContain("Boleto:");
    const todas = montarReembolso({ marca, nome: null, valorEmCentavos: null, forma: null });
    expect(todas.text).toContain("Boleto:");
  });
});
