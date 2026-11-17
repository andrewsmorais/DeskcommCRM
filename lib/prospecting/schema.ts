import { z } from "zod";

export const campaignConfigSchema = z
  .object({
    agent_id: z.string().uuid(),
    channel_session_id: z.string().uuid(),
    pipeline_id: z.string().uuid(),
    stage_id: z.string().uuid(),
    qualified_stage_id: z.string().uuid(),
    instruction: z.string().trim().min(10).max(2000),
    qualification: z.string().trim().min(10).max(2000),
    daily_limit: z.number().int().min(1).max(50).default(10),
    interval_minutes: z.number().int().min(5).max(1440).default(15),
    legal_basis_ref: z.string().trim().min(3).max(500),
    // MARCADOR DE ARQUIVAMENTO (vindo do produto original, #4359): quando
    // presente, a campanha saiu da lista principal — nada foi apagado. É do
    // SERVIDOR, nunca da pessoa: o Iniciar o descarta (`semMarcadorDeArquivamento`).
    // Precisa estar aqui porque o schema é estrito, e a conversa de uma campanha
    // arquivada continua lendo a configuração dela.
    arquivada_em: z.string().datetime().optional(),
  })
  .strict();
export const searchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    niche: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(160),
    limit: z.number().int().min(1).max(100).default(20),
    budget_usd: z.number().min(0.5).max(10).default(1),
    enrich: z.boolean().default(true),
  })
  .strict();
export const prospectingInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("configure"),
      // O motor de busca desta empresa. Ausente = mantém a escolha de antes.
      provider: z.enum(["apify", "scavio", "local-http"]).optional(),
      // Vazio só faz sentido para o `local-http`, que não tem chave por empresa.
      api_key: z.string().trim().max(500).default(""),
    })
    .strict(),
  z
    .object({ action: z.literal("search"), search: searchSchema, request_id: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal("start"), id: z.string().uuid(), config: campaignConfigSchema })
    .strict(),
  z.object({ action: z.literal("pause"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("resume"), id: z.string().uuid() }).strict(),
  // ARQUIVAR tira da lista a campanha que falhou ou veio zerada; NÃO exclui.
  z.object({ action: z.literal("arquivar"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("desarquivar"), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("select"),
      id: z.string().uuid(),
      candidate_ids: z.array(z.string().uuid()).min(1).max(5000),
      selected: z.boolean(),
    })
    .strict(),
]);
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
/** Motivo gravado quando o operador desmarca uma empresa na preparação da campanha. */
export const RAZAO_NAO_SELECIONADA = "Não selecionada pelo operador.";
/**
 * Decisão da ativação: um candidato que o operador não marcou nunca entra na
 * fila — vai direto para "Não abordado", com o motivo descritivo. O padrão é
 * `selected=true` (a escolha nasce marcada), então quem não mexer nada muda.
 */
export function razaoDeAbordarSelecionado(selected: boolean): string | null {
  return selected ? null : RAZAO_NAO_SELECIONADA;
}
export interface Prospect {
  key: string;
  name: string;
  phone: string | null;
  website: string | null;
  category: string | null;
  address: string | null;
  maps_url: string | null;
  rating: number | null;
  reviews: number | null;
  emails: string[];
  socials: string[];
}

/** The existing Maps integrations normalize Brazilian numbers; never guess a foreign country. */
export function normalizeProspect(item: Record<string, unknown>): Prospect | null {
  const str = (key: string, limit = 500) =>
    typeof item[key] === "string" ? (item[key] as string).trim().slice(0, limit) : null;
  const name = str("title", 200);
  const place = str("placeId", 200);
  if (!name || !place || item.permanentlyClosed === true || item.temporarilyClosed === true)
    return null;
  const raw = str("phoneUnformatted") || str("phone") || "";
  let digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && [10, 11].includes(digits.length)) digits = `55${digits}`;
  const phone = /^55\d{10,11}$/.test(digits) ? `+${digits}` : null;
  const urls = (key: string) =>
    Array.isArray(item[key])
      ? (item[key] as unknown[])
          .filter((v): v is string => typeof v === "string" && v.length < 500)
          .slice(0, 5)
      : [];
  return {
    key: place,
    name,
    phone,
    website: str("website"),
    category: str("categoryName"),
    address: str("address"),
    maps_url: str("url"),
    rating: typeof item.totalScore === "number" ? item.totalScore : null,
    reviews: typeof item.reviewsCount === "number" ? item.reviewsCount : null,
    emails: urls("emails"),
    socials: ["instagrams", "facebooks", "linkedIns"].flatMap(urls),
  };
}

export function safePublicLink(value: string | null): string | undefined {
  try {
    const u = new URL(value ?? "");
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Public business context shared by prospecting and the Inbox; no raw provider payload. */
export const prospectEnrichmentSchema = z.object({
  name: z.string().max(200),
  category: z.string().max(500).nullable(),
  address: z.string().max(500).nullable(),
  website: z.string().max(500).nullable(),
  maps_url: z.string().max(500).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviews: z.number().int().nonnegative().nullable(),
  emails: z.array(z.string().max(500)).max(5),
  socials: z.array(z.string().max(500)).max(15),
});
export type ProspectEnrichment = z.infer<typeof prospectEnrichmentSchema>;
