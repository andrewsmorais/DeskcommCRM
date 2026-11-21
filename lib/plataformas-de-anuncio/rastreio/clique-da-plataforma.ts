/**
 * O código de clique que cada plataforma de anúncio põe no endereço do link —
 * o que liga uma venda de volta ao anúncio (migration 0567).
 *
 *   - TikTok:    `ttclid`
 *   - Pinterest: `epik`
 *   - Taboola:   `tblci` (padrão do Taboola) ou `tbl_click_id` (quando o
 *                anunciante configura o nome à mão, como a documentação mostra)
 *
 * O Google tem caminho próprio (`google/identificadores.ts`, gclid/gbraid/wbraid)
 * e a Meta liga pelo anúncio de clique para o WhatsApp — nenhum dos dois passa aqui.
 *
 * Um código que chega sem ser trocado pela plataforma (`{click_id}`,
 * `__CLICKID__`) ou fora de tamanho é descartado: reportar venda com um código
 * falso só gera recusa na plataforma.
 */
import type { PlataformaDeAnuncio } from "../types";

export type PlataformaPorClique = Extract<PlataformaDeAnuncio, "tiktok_ads" | "pinterest_ads" | "taboola_ads">;

export interface CliqueDaPlataforma {
  plataforma: PlataformaPorClique;
  id: string;
}

const PARAMETROS: { chave: string; plataforma: PlataformaPorClique }[] = [
  { chave: "ttclid", plataforma: "tiktok_ads" },
  { chave: "epik", plataforma: "pinterest_ads" },
  { chave: "tblci", plataforma: "taboola_ads" },
  { chave: "tbl_click_id", plataforma: "taboola_ads" },
];

const VALIDO = /^[A-Za-z0-9._~\-]{6,512}$/;

export function cliqueDaPlataforma(search: URLSearchParams): CliqueDaPlataforma | null {
  for (const { chave, plataforma } of PARAMETROS) {
    const valor = search.get(chave)?.trim();
    if (!valor || /^__.*__$/.test(valor) || !VALIDO.test(valor)) continue;
    return { plataforma, id: valor };
  }
  return null;
}

/**
 * IP e navegador de quem clicou, guardados SÓ para o Pinterest — a única API
 * das três que recusa a venda sem eles quando não há e-mail. Minimização: as
 * outras plataformas não recebem nem guardam isto.
 */
export function clienteParaGuardar(
  clique: CliqueDaPlataforma | null,
  cliente: { ip: string | null; userAgent: string | null } | undefined,
): { ip: string; user_agent: string } | null {
  if (clique?.plataforma !== "pinterest_ads" || !cliente?.ip || !cliente.userAgent) return null;
  return { ip: cliente.ip.slice(0, 64), user_agent: cliente.userAgent.slice(0, 512) };
}
