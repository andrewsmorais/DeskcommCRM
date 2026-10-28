import { describe, expect, it, vi } from "vitest";

const acesso = vi.hoisted(() => ({ resposta: { ok: true } as unknown }));
vi.mock("./acesso", () => ({ verificarRecursoDoPlano: vi.fn(async () => acesso.resposta) }));

import { TOOL_CATALOG } from "@/lib/mcp/tools/catalogo";
import { eSoDeOrganizar, ferramentasDoPlano } from "./ferramentas-do-plano";

const soOrganizar = TOOL_CATALOG.find(
  (t) => t.pacotes.length === 1 && t.pacotes[0] === "organizar",
)!;
const compartilhada = TOOL_CATALOG.find(
  (t) => t.pacotes.includes("organizar") && t.pacotes.includes("vender"),
)!;

describe("agente que organiza o CRM (Impulso)", () => {
  it("capacidade que também serve para vender continua no Essencial", () => {
    expect(eSoDeOrganizar(soOrganizar.name)).toBe(true);
    expect(eSoDeOrganizar(compartilhada.name)).toBe(false);
  });

  it("Essencial: tira do turno só as capacidades exclusivas de Organizar", async () => {
    acesso.resposta = { ok: false, code: "billing_feature", status: 403, message: "x" };
    const r = await ferramentasDoPlano("org", [soOrganizar.name, compartilhada.name]);
    expect(r.toolIds).toEqual([compartilhada.name]);
    expect(r.retiradas).toEqual([soOrganizar.name]);
  });

  it("Impulso: não tira nada", async () => {
    acesso.resposta = { ok: true };
    const r = await ferramentasDoPlano("org", [soOrganizar.name, compartilhada.name]);
    expect(r.toolIds).toEqual([soOrganizar.name, compartilhada.name]);
  });

  it("leitura do plano indisponível não tira nada", async () => {
    acesso.resposta = { ok: false, code: "billing_unavailable", status: 503, message: "x" };
    const r = await ferramentasDoPlano("org", [soOrganizar.name]);
    expect(r.toolIds).toEqual([soOrganizar.name]);
  });
});
