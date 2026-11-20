/**
 * TELEFONE OCULTO — o "Ocultar número de telefone" da Umbler Talk (migration 0517).
 *
 * O gerente marca, por atendente, quem não vê o telefone dos contatos
 * (`user_organizations.ocultar_telefone`). Para essa pessoa, todo número que o
 * servidor devolve sai mascarado — mantém o código do país e os dois últimos
 * dígitos, para ela reconhecer um contato sem poder copiar o número:
 *
 *   +5511999998888        →  +55•••••••••88
 *   5511999998888@c.us    →  55•••••••••88@c.us
 *
 * PURO. Quem aplica é o cliente do Supabase do servidor
 * (`lib/supabase/server.ts`), na resposta de toda leitura feita como o usuário.
 */

/** Os campos que levam telefone nas respostas do banco. */
export const CAMPOS_DE_TELEFONE: ReadonlySet<string> = new Set([
  "phone_number",
  "phone",
  "telefone",
  "wa_identity",
  "phone_e164",
]);

export const MARCA = "•";

export function mascararTelefone(valor: string): string {
  const total = (valor.match(/\d/g) ?? []).length;
  if (total <= 4) return valor.replace(/\d/g, MARCA);
  let visto = 0;
  return valor.replace(/\d/g, (d) => {
    visto += 1;
    return visto <= 2 || visto > total - 2 ? d : MARCA;
  });
}

export function telefoneMascarado(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.includes(MARCA);
}

/** Mascara os campos de telefone em qualquer profundidade (devolve cópia). */
export function mascararTelefonesEm<T>(dado: T): T {
  if (Array.isArray(dado)) return dado.map((d) => mascararTelefonesEm(d)) as T;
  if (dado && typeof dado === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dado as Record<string, unknown>)) {
      saida[k] = CAMPOS_DE_TELEFONE.has(k) && typeof v === "string" ? mascararTelefone(v) : mascararTelefonesEm(v);
    }
    return saida as T;
  }
  return dado;
}

/** O texto JSON pode ter telefone? (barato: evita parsear toda resposta) */
export function talvezTenhaTelefone(texto: string): boolean {
  for (const c of CAMPOS_DE_TELEFONE) if (texto.includes(`"${c}"`)) return true;
  return false;
}
