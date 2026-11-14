/**
 * A VOZ DE QUEM ENVIA a prospecção (vindo do produto original, spec 24): nome,
 * o que faz e o diferencial. Mora em `organizations.settings.prospeccao` (jsonb
 * aberto, sem migration) e é da ORGANIZAÇÃO — vale para toda campanha, e não
 * precisa ser reescrita a cada prospecção.
 *
 * O produto original guarda também um "vocabulário por nicho", que alimenta o
 * gerador de site da prospecção dele. Esta instalação não tem esse gerador, então
 * o campo não entra: guardar um texto que nada lê seria prometer um efeito que
 * não existe.
 *
 * Leitura defensiva: settings malformada cai no vazio, nunca em exceção no meio
 * do envio.
 */
import { z } from "zod";

export const personalizacaoProspeccaoSchema = z
  .object({
    vendedor_nome: z.string().trim().max(80).optional(),
    vendedor_apresentacao: z.string().trim().max(300).optional(),
    vendedor_diferencial: z.string().trim().max(300).optional(),
  })
  .strict();

export type PersonalizacaoProspeccao = z.infer<typeof personalizacaoProspeccaoSchema>;

export const PERSONALIZACAO_VAZIA: PersonalizacaoProspeccao = {};

/** Lê `settings.prospeccao` sem nunca lançar. Chave desconhecida (ex.: o
 *  vocabulário gravado por uma versão do produto original) é ignorada. */
export function lerPersonalizacao(settings: unknown): PersonalizacaoProspeccao {
  if (!settings || typeof settings !== "object") return PERSONALIZACAO_VAZIA;
  const fatia = (settings as Record<string, unknown>)["prospeccao"];
  const parsed = personalizacaoProspeccaoSchema.strip().safeParse(fatia ?? {});
  return parsed.success ? parsed.data : PERSONALIZACAO_VAZIA;
}

/**
 * Bloco de voz para a instrução: quem envia e como fala. Vazio quando nada foi
 * configurado — e aí o prompt fica idêntico ao de antes.
 */
export function blocoVozVendedor(p: PersonalizacaoProspeccao): string {
  const linhas: string[] = [];
  if (p.vendedor_nome)
    linhas.push(`- Nome: ${p.vendedor_nome} (apresente-se pelo nome quando soar natural)`);
  if (p.vendedor_apresentacao) linhas.push(`- O que faz: ${p.vendedor_apresentacao}`);
  if (p.vendedor_diferencial)
    linhas.push(`- Diferencial a destacar quando couber: ${p.vendedor_diferencial}`);
  if (linhas.length === 0) return "";
  return `Quem envia as mensagens (escreva na voz dessa pessoa):\n${linhas.join("\n")}`;
}

/** Leitor mínimo (pg.Pool e PoolClient casam). */
export interface LeitorDeSettings {
  query(sql: string, params: unknown[]): Promise<{ rows: Array<{ settings: unknown }> }>;
}

/** Fail-open: qualquer falha vira personalização vazia — o envio nunca cai por config. */
export async function personalizacaoDaOrganizacao(
  db: LeitorDeSettings,
  organizationId: string,
): Promise<PersonalizacaoProspeccao> {
  try {
    const { rows } = await db.query("select settings from organizations where id = $1", [
      organizationId,
    ]);
    return lerPersonalizacao(rows[0]?.settings);
  } catch {
    return PERSONALIZACAO_VAZIA;
  }
}
