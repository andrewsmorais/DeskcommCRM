import { describe, it, expect } from "vitest";
import { evaluateConditions, resolveField, type ConditionOp } from "@/lib/automation/conditions";

const ctx = {
  event: { to_stage_id: "s2", added_tags: ["vip", "novo"] },
  lead: { title: "Ana", custom_fields: { utm_source: "instagram" }, value_cents: 5000 },
};

describe("resolveField", () => {
  it("path aninhado", () => expect(resolveField(ctx, "lead.custom_fields.utm_source")).toBe("instagram"));
  it("path ausente → undefined", () => expect(resolveField(ctx, "lead.nope.x")).toBeUndefined());
});

describe("evaluateConditions", () => {
  it("lista vazia → true (regra sem condição dispara sempre)", () =>
    expect(evaluateConditions([], ctx)).toBe(true));
  it("eq string", () =>
    expect(evaluateConditions([{ field: "event.to_stage_id", op: "eq", value: "s2" }], ctx)).toBe(true));
  it("eq com coerção numérica (valor sempre chega como string da UI)", () =>
    expect(evaluateConditions([{ field: "lead.value_cents", op: "eq", value: "5000" }], ctx)).toBe(true));
  it("neq", () =>
    expect(evaluateConditions([{ field: "event.to_stage_id", op: "neq", value: "s1" }], ctx)).toBe(true));
  it("contains em array", () =>
    expect(evaluateConditions([{ field: "event.added_tags", op: "contains", value: "vip" }], ctx)).toBe(true));
  it("contains em string (case-insensitive)", () =>
    expect(evaluateConditions([{ field: "lead.custom_fields.utm_source", op: "contains", value: "INSTA" }], ctx)).toBe(true));

  /**
   * #956: em lista, `contains` exigia a tag IDÊNTICA, com caixa. Quem escreve a
   * regra digita "Google"; a tag guardada é `google` (o editor de tags do
   * contato no Inbox grava em minúsculas) ou `google ads`. O rótulo na tela é
   * "contém" — e em texto ele já era "contém" sem caixa.
   */
  const comTags = (tags: string[]) => ({ event: { added_tags: tags } });
  it("contém em lista: casa a tag de caixa diferente", () =>
    expect(
      evaluateConditions([{ field: "event.added_tags", op: "contains", value: "Google" }], comTags(["google"])),
    ).toBe(true));
  // Os dois casos abaixo eram POSITIVOS na primeira versão do #957 ("pedaço da
  // tag"). O dono escolheu pertinência: a regra que o operador escreveu para
  // `Google` não passa a alcançar quem tem `Google Ads`. São o controle que
  // separa a decisão (B) da (A) — sem eles, "casa a caixa diferente" sozinho é
  // satisfeito pelas duas.
  it("contém em lista: NÃO casa pedaço de tag", () =>
    expect(
      evaluateConditions([{ field: "event.added_tags", op: "contains", value: "Google" }], comTags(["Google Ads"])),
    ).toBe(false));
  it("contém em lista: NÃO casa o texto no meio da tag", () =>
    expect(
      evaluateConditions([{ field: "event.added_tags", op: "contains", value: "google" }], comTags(["tráfego google"])),
    ).toBe(false));
  it("contém em lista: NÃO casa prefixo de outra tag", () =>
    expect(
      evaluateConditions([{ field: "event.added_tags", op: "contains", value: "vip" }], comTags(["vip ouro"])),
    ).toBe(false));
  it("contém em TEXTO continua sendo contém", () =>
    expect(
      evaluateConditions(
        [{ field: "event.event_type_name", op: "contains", value: "manutenção" }],
        { event: { event_type_name: "Manutenção preventiva" } },
      ),
    ).toBe(true));
  it("contém em lista: NÃO casa tag sem relação", () =>
    expect(
      evaluateConditions([{ field: "event.added_tags", op: "contains", value: "Google" }], comTags(["indicação", "vip"])),
    ).toBe(false));
  it("E entre múltiplas: uma falsa derruba", () =>
    expect(
      evaluateConditions(
        [
          { field: "event.to_stage_id", op: "eq", value: "s2" },
          { field: "lead.title", op: "eq", value: "Bia" },
        ],
        ctx,
      ),
    ).toBe(false));
  it("campo ausente → condição falsa, não erro", () =>
    expect(evaluateConditions([{ field: "lead.ghost", op: "eq", value: "x" }], ctx)).toBe(false));
  it("campo ausente com neq → true (ausente ≠ valor)", () =>
    expect(evaluateConditions([{ field: "lead.ghost", op: "neq", value: "x" }], ctx)).toBe(true));
});

describe("operadores novos (S5)", () => {
  const c = {
    lead: { title: "Ana", value_cents: 5000, tags: ["vip", "novo"], notes: "  ", phone: "5511" },
  };
  const ev = (op: ConditionOp, field: string, value = "") =>
    evaluateConditions([{ field, op, value }], c);

  it("not_contains em texto e em lista", () => {
    expect(ev("not_contains", "lead.title", "zz")).toBe(true);
    expect(ev("not_contains", "lead.title", "AN")).toBe(false);
    expect(ev("not_contains", "lead.tags", "vip")).toBe(false);
    expect(ev("not_contains", "lead.tags", "frio")).toBe(true);
  });
  it("not_contains com campo ausente é verdadeiro", () =>
    expect(ev("not_contains", "lead.nada", "x")).toBe(true));
  it("gt e lt comparam número", () => {
    expect(ev("gt", "lead.value_cents", "4999")).toBe(true);
    expect(ev("gt", "lead.value_cents", "5000")).toBe(false);
    expect(ev("lt", "lead.value_cents", "6000")).toBe(true);
    expect(ev("lt", "lead.value_cents", "5000")).toBe(false);
  });
  it("gt/lt: texto, valor vazio, campo ausente e lista nunca passam", () => {
    expect(ev("gt", "lead.title", "1")).toBe(false);
    expect(ev("gt", "lead.value_cents", "")).toBe(false);
    expect(ev("lt", "lead.nada", "10")).toBe(false);
    expect(ev("gt", "lead.tags", "0")).toBe(false);
    expect(ev("lt", "lead.notes", "10")).toBe(false);
  });
  it("is_set e is_empty", () => {
    expect(ev("is_set", "lead.phone")).toBe(true);
    expect(ev("is_set", "lead.notes")).toBe(false); // só espaços
    expect(ev("is_set", "lead.nada")).toBe(false);
    expect(ev("is_set", "lead.tags")).toBe(true);
    expect(ev("is_empty", "lead.nada")).toBe(true);
    expect(ev("is_empty", "lead.notes")).toBe(true);
    expect(ev("is_empty", "lead.phone")).toBe(false);
  });
});
