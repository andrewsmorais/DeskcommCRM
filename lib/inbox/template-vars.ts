import { aplicarBlocosCondicionais } from "@/lib/texto/bloco-condicional";
/**
 * Interpola variáveis de template com dados do contato da conversa (Onda 5).
 * Suporta {{nome}} e {{primeiro_nome}}, e as variáveis da empresa
 * ({{empresa.chave}}, Configurações › Variáveis da empresa). Variável sem valor
 * ou desconhecida mantém o literal `{{x}}` — nunca gera texto quebrado que iria
 * pro cliente: o atendente vê o literal no campo e corrige antes de enviar.
 */
export interface TemplateContact {
  name?: string | null;
}

export function interpolateTemplate(
  body: string,
  contact: TemplateContact,
  /** Já com o prefixo: `{ "empresa.endereco": "Rua X, 10" }` (`comPrefixoDaEmpresa`). */
  empresa: Record<string, string> = {},
): string {
  const full = (contact.name ?? "").trim();
  const first = full.split(/\s+/)[0] ?? "";
  // Rascunho: o bloco `{{#campo}}...{{/campo}}` FICA mesmo sem valor — a
  // variável segue visível para o atendente ver o que falta preencher. Só as
  // marcas do bloco saem.
  const semMarcasDeBloco = aplicarBlocosCondicionais(body, { temValor: () => true, manterSemValor: true });
  return semMarcasDeBloco.replace(/\{\{\s*((?:empresa\.)?[a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (literal, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (key.startsWith("empresa.")) {
      const v = empresa[key];
      return v !== undefined && v !== "" ? v : literal;
    }
    if (key === "nome") return full !== "" ? full : literal;
    if (key === "primeiro_nome") return first !== "" ? first : literal;
    return literal; // desconhecida: mantém
  });
}
