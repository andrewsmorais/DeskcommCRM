/**
 * VARIÁVEIS DA EMPRESA — o "Variáveis da organização" da Umbler Talk: chaves e
 * valores guardados UMA vez (endereço, Pix, horário, link do catálogo) e usados
 * em qualquer mensagem como `{{empresa.chave}}`. Trocou o endereço? Muda num
 * lugar só, e todos os chatbots e respostas rápidas passam a mandar o novo.
 *
 * Mora em `organizations.settings.variaveis` (jsonb, sem coluna nova). PURO:
 * o servidor, o chatbot e a tela usam a mesma régua.
 *
 * Por que o prefixo `empresa.`: as respostas do contato também viram
 * `{{variavel}}` no chatbot ("Pedir para digitar" guarda {{nome}}). Sem o
 * prefixo, uma variável da empresa chamada `nome` e a resposta do contato
 * disputariam o mesmo nome, e quem monta o fluxo não saberia qual sai.
 */
import { z } from "zod";

export const PREFIXO_DA_EMPRESA = "empresa.";
export const MAX_VARIAVEIS = 50;
export const MAX_VALOR = 1000;

/** `{{nome}}` ou `{{empresa.nome}}`. Uma RegExp nova por uso (o /g guarda estado). */
export function reVariavel(): RegExp {
  return /\{\{\s*((?:empresa\.)?[a-z_][a-z0-9_]*)\s*\}\}/g;
}

/** O texto é inteiro UMA variável (link ou botão guardado numa variável)? */
export function ehSoUmaVariavel(texto: string): boolean {
  return /^\{\{\s*(?:empresa\.)?[a-z_][a-z0-9_]*\s*\}\}$/.test(texto);
}

export const chaveDaVariavelSchema = z
  .string()
  .trim()
  .min(1, "Dê um nome à variável.")
  .max(40, "Nome de variável com até 40 letras.")
  .regex(/^[a-z_][a-z0-9_]*$/, "Use só letras minúsculas sem acento, números e _ (ex.: endereco, pix_da_loja).");

export const variavelDaEmpresaSchema = z.object({
  chave: chaveDaVariavelSchema,
  valor: z.string().max(MAX_VALOR, `Valor com até ${MAX_VALOR} caracteres.`),
  descricao: z.string().trim().max(120).nullable().default(null),
});
export type VariavelDaEmpresa = z.infer<typeof variavelDaEmpresaSchema>;

export const variaveisDaEmpresaSchema = z
  .array(variavelDaEmpresaSchema)
  .max(MAX_VARIAVEIS, `No máximo ${MAX_VARIAVEIS} variáveis.`)
  .superRefine((lista, ctx) => {
    const vistas = new Set<string>();
    lista.forEach((v, i) => {
      if (vistas.has(v.chave))
        ctx.addIssue({ code: "custom", path: [i, "chave"], message: `A variável "${v.chave}" aparece duas vezes.` });
      vistas.add(v.chave);
    });
  });

/**
 * Lê `organizations.settings.variaveis`. Valor torto vira lista vazia, e item
 * torto é descartado sozinho: uma variável quebrada no jsonb não pode derrubar
 * o envio do chatbot.
 */
export function lerVariaveisDaEmpresa(settings: unknown): VariavelDaEmpresa[] {
  const bruto = (settings as { variaveis?: unknown } | null)?.variaveis;
  if (!Array.isArray(bruto)) return [];
  const saida: VariavelDaEmpresa[] = [];
  const vistas = new Set<string>();
  for (const item of bruto.slice(0, MAX_VARIAVEIS)) {
    const r = variavelDaEmpresaSchema.safeParse(item);
    if (r.success && !vistas.has(r.data.chave)) {
      vistas.add(r.data.chave);
      saida.push(r.data);
    }
  }
  return saida;
}

/** As variáveis prontas para substituir: `{ "empresa.endereco": "Rua X, 10" }`. */
export function comPrefixoDaEmpresa(lista: VariavelDaEmpresa[] | undefined | null): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const v of lista ?? []) saida[`${PREFIXO_DA_EMPRESA}${v.chave}`] = v.valor;
  return saida;
}

/** Tira as variáveis da empresa de um conjunto de dados (o que se grava na sessão). */
export function semVariaveisDaEmpresa(dados: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(dados).filter(([k]) => !k.startsWith(PREFIXO_DA_EMPRESA)));
}
