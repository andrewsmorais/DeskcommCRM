/**
 * Chat no site (migration 0518) — o que o dono configura e o que o visitante
 * manda, em schemas.
 *
 * A configuração mora em `channel_sessions.metadata.webchat` (não em colunas):
 * é a aparência do balão, lida inteira de uma vez e sem consulta por campo.
 * O schema abaixo é a fonte única — a rota de gestão grava por ele e a rota
 * pública lê por ele, então um campo velho ou editado à mão cai no padrão em
 * vez de quebrar o balão no site do cliente.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { textoGuardavel } from "@/lib/seguranca/entrada";

export const COR_PADRAO = "#4f46e5";

/** Domínio como o dono digita: "loja.com.br", sem protocolo nem caminho. */
const dominioSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((valor) => valor.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^\*\./, ""))
  .pipe(
    z
      .string()
      .min(3)
      .max(253)
      .regex(/^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d{2,5})?$/, "Domínio inválido"),
  );

export const configDoChatSchema = z.object({
  titulo: z.string().trim().min(1).max(60).default("Fale com a gente"),
  saudacao: z
    .string()
    .trim()
    .max(300)
    .default("Olá! Como podemos ajudar? Escreva sua mensagem que respondemos por aqui."),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB")
    .default(COR_PADRAO),
  /** Vazio = qualquer site pode mostrar o balão. */
  dominios: z.array(dominioSchema).max(20).default([]),
  /** Pede nome (e opcionalmente e-mail) antes da primeira mensagem. */
  pedir_nome: z.boolean().default(true),
});

export type ConfigDoChat = z.output<typeof configDoChatSchema>;

/** Lê a configuração gravada, caindo no padrão campo a campo — nunca lança. */
export function lerConfigDoChat(metadata: unknown): ConfigDoChat {
  const bruto =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).webchat
      : undefined;
  const lido = configDoChatSchema.safeParse(bruto ?? {});
  if (lido.success) return lido.data;
  // Campo inválido não derruba os outros: tenta um por um.
  const base = configDoChatSchema.parse({});
  const obj = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  for (const campo of Object.keys(base) as (keyof ConfigDoChat)[]) {
    const um = configDoChatSchema.shape[campo].safeParse(obj[campo]);
    if (um.success) (base as Record<string, unknown>)[campo] = um.data;
  }
  return base;
}

/** Chave pública do balão: 32 hex. Vai no HTML do site; não é segredo. */
export function novaChaveDoChat(): string {
  return randomBytes(16).toString("hex");
}

export const chaveDoChatSchema = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * O TOKEN do visitante: 32 bytes aleatórios em base64url (43 letras), gerados
 * no navegador dele e guardados só lá. É a prova de que quem pede o histórico
 * é quem escreveu. O banco guarda o SHA-256 — vazar o banco não deixa ninguém
 * se passar pelo visitante.
 */
export const tokenDoVisitanteSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function hashDoVisitante(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Identidade do contato e id da conversa no canal. */
export function identidadeDoVisitante(canalId: string, hash: string): string {
  return `webchat:${canalId}:${hash}`;
}

const textoDoVisitante = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(textoGuardavel, "Texto com caracteres inválidos");

export const envioDoVisitanteSchema = z.object({
  visitante: tokenDoVisitanteSchema,
  /** Id da mensagem gerado pelo balão: reenviar a mesma não duplica. */
  id: z.string().uuid(),
  texto: textoDoVisitante,
  nome: z
    .string()
    .trim()
    .max(80)
    .refine(textoGuardavel, "Nome com caracteres inválidos")
    .optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  /** Página em que o visitante estava — vira contexto para o atendente. */
  pagina: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\//i, "Só endereço http(s)")
    .url()
    .optional(),
});

export const leituraDoVisitanteSchema = z.object({
  visitante: tokenDoVisitanteSchema,
  /** Só o que chegou depois deste instante (ISO). Sem ele, as últimas 50. */
  depois: z.string().datetime({ offset: true }).optional(),
});

/**
 * O `Origin` do pedido pode mostrar o balão? Lista vazia = qualquer site.
 * Subdomínio vale: "loja.com.br" libera "www.loja.com.br".
 */
export function origemPermitida(origem: string | null, dominios: readonly string[]): boolean {
  if (dominios.length === 0) return true;
  if (!origem) return false;
  let host: string;
  try {
    host = new URL(origem).host.toLowerCase();
  } catch {
    return false;
  }
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}
