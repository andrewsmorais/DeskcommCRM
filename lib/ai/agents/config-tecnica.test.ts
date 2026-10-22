import { describe, expect, it } from "vitest";
import {
  CAMPOS_TECNICOS,
  configTecnicaDaPlataforma,
  podeEditarConfigTecnica,
  travarConfigTecnica,
} from "./config-tecnica";

const pedidoDoCliente = {
  system_prompt: "Atenda com educação.",
  provider: "anthropic",
  model: "claude-opus-caro",
  credential_id: "11111111-1111-4111-8111-111111111111",
  operator_model: "outro",
  max_steps: 25,
  token_budget: 999_999,
  cost_budget_cents: 99_999,
  history_message_window: 200,
  history_token_window: 200_000,
  tool_ids: ["crm.lead.get"],
};

describe("quem pode mexer na configuração técnica", () => {
  it("só o super-admin fora de sessão de suporte", () => {
    expect(podeEditarConfigTecnica({ is_platform_admin: true, support: null })).toBe(true);
    expect(podeEditarConfigTecnica({ is_platform_admin: true, support: { id: "s" } })).toBe(false);
    expect(podeEditarConfigTecnica({ is_platform_admin: false, support: null })).toBe(false);
    expect(podeEditarConfigTecnica({})).toBe(false);
  });
});

describe("padrão da plataforma", () => {
  it("OpenAI + gpt-5.4-nano + chave da instalação quando o ambiente não diz nada", () => {
    const c = configTecnicaDaPlataforma({});
    expect(c.provider).toBe("openai");
    expect(c.model).toBe("gpt-5.4-nano");
    expect(c.credential_id).toBeNull();
  });

  it("segue o ambiente, e provedor desconhecido cai no padrão em vez de lançar", () => {
    expect(configTecnicaDaPlataforma({ PLATAFORMA_IA_MODELO: "gpt-5.4-mini" }).model).toBe("gpt-5.4-mini");
    expect(configTecnicaDaPlataforma({ PLATAFORMA_IA_PROVEDOR: "inventado" }).provider).toBe("openai");
  });
});

describe("trava no servidor", () => {
  it("super-admin grava o que mandou", () => {
    expect(travarConfigTecnica(pedidoDoCliente, { pode: true, modo: "insert" })).toEqual(pedidoDoCliente);
  });

  it("cliente criando agente: a técnica vira o padrão da plataforma e o resto passa", () => {
    const v = travarConfigTecnica(pedidoDoCliente, { pode: false, modo: "insert", ambiente: {} });
    const padrao = configTecnicaDaPlataforma({});
    for (const campo of CAMPOS_TECNICOS) expect(v[campo]).toEqual(padrao[campo]);
    expect(v.system_prompt).toBe(pedidoDoCliente.system_prompt);
    expect(v.tool_ids).toEqual(pedidoDoCliente.tool_ids);
  });

  it("cliente salvando versão nova: herda o que o super-admin configurou no agente", () => {
    const base = { ...configTecnicaDaPlataforma({}), model: "gpt-5.4-mini", max_steps: 12 };
    const v = travarConfigTecnica(pedidoDoCliente, { pode: false, modo: "insert", base });
    expect(v.model).toBe("gpt-5.4-mini");
    expect(v.max_steps).toBe(12);
    expect(v.credential_id).toBeNull();
  });

  it("cliente editando rascunho: os campos técnicos saem do patch", () => {
    const p = travarConfigTecnica(pedidoDoCliente, { pode: false, modo: "patch" });
    for (const campo of CAMPOS_TECNICOS) expect(campo in p).toBe(false);
    expect(p.system_prompt).toBe(pedidoDoCliente.system_prompt);
  });
});
