/**
 * Condições do motor de regras: filtros simples em AND.
 * Campo ausente = condição falsa (nunca erro), salvo nos operadores que
 * perguntam justamente pela ausência (`neq`, `not_contains`, `is_empty`).
 * Coerção via String() dos dois lados — o value vem sempre como string da UI.
 *
 * Operadores novos: `not_contains` (o contrário de `contains`), `gt`/`lt`
 * (comparação NUMÉRICA, ex.: valor do negócio), `is_set`/`is_empty` (o campo
 * tem ou não conteúdo; o `value` é ignorado).
 */
export type ConditionOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "lt"
  | "is_set"
  | "is_empty";

/** Operadores que não olham o `value`. */
export const OPS_SEM_VALOR: readonly ConditionOp[] = ["is_set", "is_empty"];

export interface RuleCondition {
  field: string;
  op: ConditionOp;
  value: string;
}

export function resolveField(context: Record<string, unknown>, path: string): unknown {
  let cur: unknown = context;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function temConteudo(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") return raw.trim() !== "";
  return true;
}

function emTexto(raw: unknown, valor: string): boolean {
  const alvo = valor.toLowerCase();
  // Mesma regra do `contains`: em lista é pertinência (tag inteira), em texto é "contém".
  if (Array.isArray(raw)) return raw.some((item) => String(item).toLowerCase() === alvo);
  return String(raw).toLowerCase().includes(alvo);
}

function matches(cond: RuleCondition, context: Record<string, unknown>): boolean {
  const raw = resolveField(context, cond.field);
  if (cond.op === "is_set") return temConteudo(raw);
  if (cond.op === "is_empty") return !temConteudo(raw);
  if (raw === undefined || raw === null) return cond.op === "neq" || cond.op === "not_contains";
  if (cond.op === "not_contains") return !emTexto(raw, cond.value);
  if (cond.op === "gt" || cond.op === "lt") {
    // Valor vazio vira 0 em Number("") — recusar, senão "maior que (nada)" passa tudo.
    if (typeof raw === "boolean" || cond.value.trim() === "") return false;
    const a = typeof raw === "number" ? raw : Number(String(raw).trim());
    const b = Number(cond.value);
    if (String(raw).trim() === "" || !Number.isFinite(a) || !Number.isFinite(b)) return false;
    return cond.op === "gt" ? a > b : a < b;
  }
  if (cond.op === "contains") {
    // Um operador, um significado (#956). Em lista ele exigia a tag IDÊNTICA,
    // com caixa, enquanto em texto já era "contém" sem caixa — e a tela chama os
    // dois de "contém". Quem escreve a regra digita "Google" e a tag guardada é
    // `google` (o editor do Inbox grava em minúsculas) ou `google ads`.
    const alvo = cond.value.toLowerCase();
    // Em LISTA o operador é pertinência: a tag inteira, sem diferenciar caixa.
    // Decisão do dono do produto (16/09, issue #956): "Google" pega `google` e
    // NÃO pega `google ads`, porque uma atualização não pode fazer uma regra
    // que dispara WhatsApp alcançar quem ela não alcançava. Em TEXTO segue
    // sendo "contém" de verdade — é o que o campo `event.event_type_name`
    // usa para "Manutenção" pegar os três tipos de atendimento.
    if (Array.isArray(raw)) return raw.some((item) => String(item).toLowerCase() === alvo);
    return String(raw).toLowerCase().includes(alvo);
  }
  const equal = String(raw) === cond.value;
  return cond.op === "eq" ? equal : !equal;
}

export function evaluateConditions(
  conditions: RuleCondition[],
  context: Record<string, unknown>,
): boolean {
  return conditions.every((c) => matches(c, context));
}
