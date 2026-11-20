/**
 * Vendas por campanha — a leitura da `fn_vendas_por_campanha` (migration 0566)
 * e a conta que a tela mostra.
 *
 * O banco devolve uma linha por (plataforma, campanha); aqui elas viram grupos
 * por plataforma, na ordem em que o dono anuncia (Meta, Google, TikTok,
 * Pinterest), com o total de cada grupo. A taxa de venda é vendas ÷ contatos:
 * "de cada 100 pessoas que esta campanha trouxe, quantas compraram".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PLATAFORMAS_DA_TELA = ["meta", "google", "tiktok", "pinterest", "outra", "sem_origem"] as const;
export type PlataformaDaTela = (typeof PLATAFORMAS_DA_TELA)[number];

export const NOME_DA_PLATAFORMA: Record<PlataformaDaTela, string> = {
  meta: "Facebook e Instagram",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  pinterest: "Pinterest Ads",
  outra: "Outras origens",
  sem_origem: "Sem campanha rastreada",
};

export interface LinhaDaCampanha {
  campanha: string | null;
  contatos: number;
  negocios: number;
  avancaram: number;
  vendas: number;
  faturamentoCents: number;
}

export interface GrupoDaPlataforma {
  plataforma: PlataformaDaTela;
  campanhas: LinhaDaCampanha[];
  total: LinhaDaCampanha;
}

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function periodoDaUrl(valor: unknown): Periodo {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

type LinhaCrua = {
  plataforma: string;
  campanha: string | null;
  contatos: number | string;
  negocios: number | string;
  avancaram: number | string;
  vendas: number | string;
  faturamento_cents: number | string;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

/** Agrupa e ordena: plataforma na ordem fixa; dentro dela, mais vendas e mais contatos primeiro. */
export function agruparPorPlataforma(linhas: LinhaCrua[]): GrupoDaPlataforma[] {
  const grupos = new Map<PlataformaDaTela, LinhaDaCampanha[]>();
  for (const l of linhas) {
    const p = (PLATAFORMAS_DA_TELA as readonly string[]).includes(l.plataforma)
      ? (l.plataforma as PlataformaDaTela)
      : "outra";
    const lista = grupos.get(p) ?? [];
    lista.push({
      campanha: l.campanha,
      contatos: num(l.contatos),
      negocios: num(l.negocios),
      avancaram: num(l.avancaram),
      vendas: num(l.vendas),
      faturamentoCents: num(l.faturamento_cents),
    });
    grupos.set(p, lista);
  }
  return PLATAFORMAS_DA_TELA.filter((p) => grupos.has(p)).map((plataforma) => {
    const campanhas = grupos
      .get(plataforma)!
      .sort((a, b) => b.vendas - a.vendas || b.faturamentoCents - a.faturamentoCents || b.contatos - a.contatos);
    const total = campanhas.reduce<LinhaDaCampanha>(
      (t, c) => ({
        campanha: null,
        contatos: t.contatos + c.contatos,
        negocios: t.negocios + c.negocios,
        avancaram: t.avancaram + c.avancaram,
        vendas: t.vendas + c.vendas,
        faturamentoCents: t.faturamentoCents + c.faturamentoCents,
      }),
      { campanha: null, contatos: 0, negocios: 0, avancaram: 0, vendas: 0, faturamentoCents: 0 },
    );
    return { plataforma, campanhas, total };
  });
}

/** Vendas ÷ contatos, em %, com uma casa; `null` sem contatos. */
export function taxaDeVenda(l: Pick<LinhaDaCampanha, "vendas" | "contatos">): number | null {
  if (l.contatos <= 0) return null;
  return Math.round((l.vendas / l.contatos) * 1000) / 10;
}

export async function lerVendasPorCampanha(
  admin: SupabaseClient,
  organizationId: string,
  dias: Periodo,
  agora: Date = new Date(),
): Promise<GrupoDaPlataforma[]> {
  const desde = new Date(agora.getTime() - dias * 86_400_000);
  const { data, error } = await admin.rpc("fn_vendas_por_campanha" as never, {
    p_org: organizationId,
    p_desde: desde.toISOString(),
    p_ate: agora.toISOString(),
  } as never);
  if (error) throw new Error(`fn_vendas_por_campanha: ${(error as { message: string }).message}`);
  return agruparPorPlataforma((data ?? []) as LinhaCrua[]);
}
