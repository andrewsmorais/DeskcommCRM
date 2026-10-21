import { describe, expect, it } from "vitest";
import { criarModeloDeObjetivo, OBJETIVOS_DO_AGENTE } from "@/lib/ai/agents/modelos-de-objetivo";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { IDS_DO_HARNESS } from "@/lib/mcp/tools/ferramentas-do-harness";
import { TETO_TOOLS_POR_AGENTE, type CapacidadeSelecionavel } from "@/lib/mcp/tools/selecao-por-pacote";
import { agentMcpCreateSchema } from "@/lib/ai/agents/validation";

const catalogo = TOOL_CATALOG.map((item) => ({ ...item, marcavel: !IDS_DO_HARNESS.has(item.name) && !item.apenasHumano }));

describe("modelos iniciais por objetivo", () => {
  it.each(OBJETIVOS_DO_AGENTE)("$rotulo usa nome real e gera campos válidos do rascunho", ({ id }) => {
    const resultado = criarModeloDeObjetivo({ objetivo: id, nomeDaOrganizacao: "Clínica Aurora", catalogo });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const modelo = resultado.modelo;
    expect(modelo.system_prompt).toContain("Clínica Aurora");
    expect(modelo.tool_ids.length).toBeLessThanOrEqual(TETO_TOOLS_POR_AGENTE);
    expect(modelo.tool_ids.length).toBeGreaterThan(0);
    expect(modelo.tool_ids.every((name) => catalogo.some((tool) => tool.name === name && tool.marcavel && tool.risco !== "critico"))).toBe(true);
    expect(agentMcpCreateSchema.safeParse({
      name: modelo.name,
      description: modelo.description,
      version: { system_prompt: modelo.system_prompt, tool_ids: modelo.tool_ids, cases_enabled: modelo.cases_enabled, provider: "openai", model: "modelo-escolhido", credential_id: null, channel_session_id: null },
    }).success).toBe(true);
    expect(modelo).not.toHaveProperty("credential_id");
    expect(modelo).not.toHaveProperty("channel_session_id");
    expect(modelo).not.toHaveProperty("pipeline_ids");
    expect(modelo).not.toHaveProperty("knowledge_source_ids");
    expect(modelo).not.toHaveProperty("provider");
    expect(modelo).not.toHaveProperty("model");
    expect(modelo).not.toHaveProperty("status");
  });

  it("agendamento prepara operações disponíveis e deixa cancelamento para autorização individual", () => {
    const resultado = criarModeloDeObjetivo({ objetivo: "agendamento", nomeDaOrganizacao: "Aurora", catalogo });
    if (!resultado.ok) throw new Error("modelo indisponível");
    expect(resultado.modelo.tool_ids).toEqual(expect.arrayContaining(["crm_list_event_types", "crm_find_free_slots", "crm_find_and_book_appointment", "crm_reschedule_appointment", "crm_confirm_appointment"]));
    expect(resultado.modelo.tool_ids).not.toContain("crm_cancel_appointment");
    expect(resultado.modelo.tool_ids).not.toContain("crm_create_lead");
  });

  it("não acrescenta capacidade ausente, crítica ou operada pelo motor", () => {
    const disponiveis: CapacidadeSelecionavel[] = [
      { name: "crm_find_free_slots", risco: "seguro", pacotes: ["vender"] },
      { name: "crm_cancel_appointment", risco: "critico", pacotes: ["vender"] },
      { name: "crm_book_appointment", risco: "atencao", pacotes: ["vender"], marcavel: false },
    ];
    const resultado = criarModeloDeObjetivo({ objetivo: "agendamento", nomeDaOrganizacao: "Aurora", catalogo: disponiveis });
    if (!resultado.ok) throw new Error("modelo indisponível");
    expect(resultado.modelo.tool_ids).toEqual(["crm_find_free_slots"]);
  });

  it("recusa um pacote que ultrapassa o teto sem truncar silenciosamente", () => {
    const disponiveis: CapacidadeSelecionavel[] = Array.from({ length: TETO_TOOLS_POR_AGENTE + 1 }, (_, i) => ({ name: `capacidade_${i}`, risco: "seguro", pacotes: ["atender"] }));
    expect(criarModeloDeObjetivo({ objetivo: "atendimento", nomeDaOrganizacao: "Aurora", catalogo: disponiveis })).toEqual({ ok: false, motivo: "limite_de_capacidades" });
  });

  it("suporte abre pendências internas; os outros objetivos não as habilitam", () => {
    for (const objetivo of OBJETIVOS_DO_AGENTE) {
      const resultado = criarModeloDeObjetivo({ objetivo: objetivo.id, nomeDaOrganizacao: "Aurora", catalogo });
      if (!resultado.ok) throw new Error("modelo indisponível");
      expect(resultado.modelo.cases_enabled).toBe(objetivo.id === "suporte");
    }
  });
});
