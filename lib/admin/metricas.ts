/**
 * Leitura das métricas do DONO da plataforma (`/admin/metricas`).
 *
 * Tudo vem de funções SQL `fn_admin_metricas_*` (migrations 0484/0485), executáveis
 * SÓ pelo `service_role`: nem `anon` nem `authenticated` alcançam. Quem chama
 * precisa ter passado por `requirePlatformAdmin()` antes — o layout de `/admin`
 * já faz isso, e a página repete o gate por ser a porta dos dados de todas as
 * empresas.
 *
 * "Empresa de teste" = `organizations.settings.excluir_das_metricas = true`. O MRR,
 * o churn e a aquisição a ignoram por padrão; o custo de IA NÃO, porque é dinheiro
 * real gasto.
 *
 * Moedas: receita em centavos de REAL; custo de IA vem em centavos de DÓLAR
 * (`llm_calls.cost_cents`) e só vira real dentro de `fn_admin_metricas_lucro`, com o
 * câmbio que o dono informa. Nenhuma cotação ao vivo.
 */
import { createAdminClient } from "@/lib/supabase/admin";

type RpcResultado = { data: unknown; error: { message: string } | null };
type ClienteComRpc = { rpc: (nome: string, args?: Record<string, unknown>) => Promise<RpcResultado> };

export interface LinhaPorPlano {
  plano: string;
  empresas: number;
  atendentes: number;
  mrr_cents: number;
}
export interface LinhaPorCiclo {
  ciclo: string;
  empresas: number;
  mrr_cents: number;
}
export interface MetricasReceita {
  mrr_cents: number;
  arr_cents: number;
  pagantes: number;
  atendentes_pagos: number;
  ticket_medio_cents: number;
  novas_30d: number;
  cancelamentos_30d: number;
  churn_30d_pct: number;
  por_plano: LinhaPorPlano[];
  por_ciclo: LinhaPorCiclo[];
}
export interface DiaDeCrescimento {
  dia: string;
  novas_empresas: number;
  novas_assinaturas: number;
  cancelamentos: number;
}
export interface MetricasIA {
  chamadas: number;
  /** Centavos de DÓLAR. */
  custo_cents: number;
  tokens_entrada: number;
  tokens_saida: number;
  chamadas_com_erro: number;
  latencia_media_ms: number;
  por_modelo: { modelo: string; chamadas: number; custo_cents: number }[];
  por_empresa: { organization_id: string; chamadas: number; custo_cents: number }[];
}
export interface LinhaDeAquisicao {
  origem: string;
  empresas: number;
}
export interface MetricasLucro {
  mrr_cents: number;
  custo_ia_cents_brl: number;
  cambio_usd_brl: number;
  custos_fixos_cents: number;
  taxas_percentuais_cents: number;
  lucro_liquido_cents: number;
  margem_pct: number | null;
}
export interface CustoDaPlataforma {
  id: string;
  nome: string;
  categoria: string;
  tipo: "fixo_mensal" | "percentual_receita";
  valor_cents: number;
  basis_points: number;
  ativo: boolean;
}

export type Leitura<T> = { ok: true; dados: T } | { ok: false; motivo: string };

async function chamar<T>(nome: string, args: Record<string, unknown>): Promise<Leitura<T>> {
  try {
    const admin = createAdminClient() as unknown as ClienteComRpc;
    const { data, error } = await admin.rpc(nome, args);
    if (error) return { ok: false, motivo: "consulta_falhou" };
    return { ok: true, dados: data as T };
  } catch {
    return { ok: false, motivo: "consulta_indisponivel" };
  }
}

export const lerReceita = (incluirTeste = false) =>
  chamar<MetricasReceita>("fn_admin_metricas_receita", { p_incluir_teste: incluirTeste });

export const lerCrescimento = (dias = 90, incluirTeste = false) =>
  chamar<DiaDeCrescimento[]>("fn_admin_metricas_crescimento", {
    p_dias: Math.min(Math.max(Math.trunc(dias) || 90, 7), 365),
    p_incluir_teste: incluirTeste,
  });

export const lerIA = (dias = 30) =>
  chamar<MetricasIA>("fn_admin_metricas_ia", { p_dias: Math.min(Math.max(Math.trunc(dias) || 30, 1), 365) });

export const lerAquisicao = (incluirTeste = false) =>
  chamar<LinhaDeAquisicao[]>("fn_admin_metricas_aquisicao", { p_incluir_teste: incluirTeste });

export const lerLucro = (cambioUsdBrl = 5.5) =>
  chamar<MetricasLucro>("fn_admin_metricas_lucro", {
    p_cambio_usd_brl: Number.isFinite(cambioUsdBrl) && cambioUsdBrl > 0 ? cambioUsdBrl : 5.5,
  });

export async function lerCustos(): Promise<Leitura<CustoDaPlataforma[]>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_custos_fixos" as never)
      .select("id, nome, categoria, tipo, valor_cents, basis_points, ativo")
      .order("created_at", { ascending: true });
    if (error) return { ok: false, motivo: "consulta_falhou" };
    return { ok: true, dados: (data ?? []) as unknown as CustoDaPlataforma[] };
  } catch {
    return { ok: false, motivo: "consulta_indisponivel" };
  }
}

/** Rótulos legíveis das origens gravadas em `org_aquisicao.origem`. */
export const ROTULO_DA_ORIGEM: Record<string, string> = {
  nao_informada: "Não informada",
  google_organico: "Google (busca)",
  anuncio: "Anúncio pago",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  direto: "Direto",
};

export const ROTULO_DO_PLANO: Record<string, string> = {
  essencial: "Essencial",
  impulso: "Impulso",
  escala: "Escala",
  desconhecido: "Sem plano",
};
