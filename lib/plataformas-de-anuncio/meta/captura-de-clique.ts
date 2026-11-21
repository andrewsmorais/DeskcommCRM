/**
 * O par ref↔UTM: criado quando alguém clica no botão da landing page (a rota
 * `app/api/v1/anuncios/meta/[org]/route.ts`), consumido quando a mensagem do
 * WhatsApp chega com o ref no texto.
 *
 * Mora aqui, e não em `lib/leads/`, pela mesma razão do irmão do Google: o
 * DADO é o da captura de anúncio, e esta pasta é a segunda fronteira que
 * `lib/plataformas-de-anuncio/types.ts` declara. O MECANISMO do ref (alfabeto,
 * tamanho, retentativa, padrão no texto) é compartilhado em
 * `../captura-de-clique.ts`.
 *
 * Só a metade de CONSUMO vive aqui — a de criação é a genérica, chamada
 * direto pela rota com a tabela como parâmetro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export interface ClickRefDaPaginaCasado {
  /** Só chaves de `CHAVES_DE_UTM`, como a rota as normalizou antes de gravar. */
  utm: Record<string, string>;
  /** Código de clique de TikTok, Pinterest ou Taboola, quando o link trouxe (0567). */
  clique?: { plataforma: "tiktok_ads" | "pinterest_ads" | "taboola_ads"; id: string };
  /** IP e navegador do clique — só existe para o Pinterest. */
  cliente?: { ip: string; user_agent: string };
}

const PLATAFORMAS_POR_CLIQUE = new Set(["tiktok_ads", "pinterest_ads", "taboola_ads"]);

function lerExtrasDoClique(bruto: unknown): Pick<ClickRefDaPaginaCasado, "clique" | "cliente"> {
  const q = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const c = q.clique as { plataforma?: unknown; id?: unknown } | undefined;
  const clique =
    c && typeof c.id === "string" && c.id && PLATAFORMAS_POR_CLIQUE.has(String(c.plataforma))
      ? { plataforma: c.plataforma as "tiktok_ads" | "pinterest_ads" | "taboola_ads", id: c.id }
      : undefined;
  const k = q.cliente as { ip?: unknown; user_agent?: unknown } | undefined;
  const cliente =
    clique?.plataforma === "pinterest_ads" && k && typeof k.ip === "string" && typeof k.user_agent === "string"
      ? { ip: k.ip, user_agent: k.user_agent }
      : undefined;
  return { ...(clique ? { clique } : {}), ...(cliente ? { cliente } : {}) };
}

/**
 * Casa um ref com um contato — a UPDATE condicional que garante que um clique
 * só é consumido UMA vez. `matched_at is null` no WHERE é a trava: o mesmo
 * texto encaminhado adiante não vira atribuição de quem o recebeu, porque a
 * segunda tentativa não encontra o que atualizar.
 *
 * `organization_id` no WHERE é a lição da #236: ref de uma organização nunca
 * pode casar na outra.
 */
export async function casarClickRef(
  admin: SupabaseClient,
  organizationId: string,
  token: string,
  contactId: string,
): Promise<ClickRefDaPaginaCasado | null> {
  const { data, error } = await admin
    .from("meta_ads_click_refs")
    .update({ matched_at: new Date().toISOString(), contact_id: contactId })
    .eq("organization_id", organizationId)
    .eq("token", token)
    .is("matched_at", null)
    .select("utm, query_raw")
    .maybeSingle();

  if (error) {
    logger.error("[meta.captura-de-clique] update de match falhou", {
      organizationId,
      codigo: error.code,
      detalhe: error.message,
    });
    return null;
  }
  if (!data) return null;

  const linha = data as { utm: Record<string, string> | null; query_raw: unknown };
  const utm = linha.utm;
  // A coluna é `not null` com `check (utm <> '{}')`, então isto é defesa de
  // borda, não caso esperado: linha sem UTM não teria o que estampar.
  if (!utm || Object.keys(utm).length === 0) return null;
  return { utm, ...lerExtrasDoClique(linha.query_raw) };
}
