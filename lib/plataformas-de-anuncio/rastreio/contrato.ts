import { z } from "zod";
import { normalizarUtm } from "@/lib/leads/origem-do-site";
import { textoSemRef } from "../texto-do-ref";

export const linkSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(100),
  whatsapp_e164: z
    .string()
    .trim()
    .regex(/^\+[1-9][0-9]{7,14}$/),
  message_template: z.string().trim().min(1).max(900),
  use_case: z.enum(["site", "anuncio", "organico"]),
  utm: z.record(z.string(), z.string().max(200)).refine((v) => Object.keys(v).length <= 10),
  enabled: z.boolean(),
});
export type LinkInput = z.infer<typeof linkSchema>;
export type LinkRastreavel = LinkInput & { id: string; organization_id: string };
export type MetricasLink = { link_id: string; clicks: number; contacts: number; leads: number };

export function mensagemComRef(texto: string): string {
  return `${textoSemRef(texto)
    .replace(/\[ref:[^\]]*\]/g, "")
    .trim()} [ref:{token}]`;
}
export function utmsDoLink(
  link: Pick<LinkRastreavel, "utm" | "use_case" | "name">,
  search: URLSearchParams,
) {
  const utm = normalizarUtm({ ...link.utm, ...Object.fromEntries(search.entries()) });
  // Marcador que a plataforma não trocou (clique de teste, fora do anúncio):
  // `{campaignname}`, `{{ad.name}}` ou `__CAMPAIGN_NAME__` não são nome de campanha.
  for (const [k, v] of Object.entries(utm)) if (/[{}<>]|^__[A-Z0-9_]+__$/.test(v)) delete utm[k];
  return {
    utm_source: link.use_case === "organico" ? "organico" : "site",
    utm_campaign: link.name,
    ...utm,
  };
}
// Auto-tagging preserva gclid/gbraid/wbraid; não inventamos macros sem suporte do Google.
export const SUFIXO_GOOGLE =
  "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}";
export const MODELO_GOOGLE = `{lpurl}?${SUFIXO_GOOGLE}`;

/**
 * O complemento do link rastreável para cada plataforma de anúncio: cada uma
 * troca o próprio marcador pelo nome da campanha no clique, e a UTM chega ao
 * CRM pronta para a tela Vendas por campanha (`fn_vendas_por_campanha`).
 * Marcadores conferidos na ajuda de cada plataforma em 20/11/2026:
 *  - Meta: `{{campaign.name}}`, `{{ad.name}}` (parâmetros dinâmicos de URL);
 *  - TikTok: `__CAMPAIGN_NAME__`, `__CID_NAME__`;
 *  - Pinterest: `{campaignname}`, `{adid}`.
 * O Google Ads usa o sufixo de URL final (`SUFIXO_GOOGLE`), não o link.
 */
export const PARAMETROS_POR_PLATAFORMA = [
  {
    plataforma: "Facebook e Instagram (Meta Ads)",
    parametros: "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}",
  },
  {
    plataforma: "TikTok Ads",
    parametros: "utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_NAME__&utm_content=__CID_NAME__",
  },
  {
    plataforma: "Pinterest Ads",
    parametros: "utm_source=pinterest&utm_medium=paid&utm_campaign={campaignname}&utm_content={adid}",
  },
] as const;
