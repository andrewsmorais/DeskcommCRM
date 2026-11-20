/**
 * GET/POST /api/v1/cron/nuvemshop-checkouts — traz os CARRINHOS ABANDONADOS das
 * lojas Nuvemshop conectadas.
 *
 * A Nuvemshop avisa pedido, mas não avisa carrinho abandonado: ele só existe na
 * API (`GET /checkouts`, permissão `read_orders`). Esta rodada lê, para cada
 * loja, os carrinhos novos desde o último visto e entrega cada um à Captação
 * como `carrinho_abandonado`, com o link que retoma a compra
 * (`abandoned_checkout_url`). Daí em diante é igual a Shopify e Yampi: contato +
 * negócio na etapa "Carrinho abandonado", e o follow-up de recuperação.
 *
 * O CURSOR é o maior id já tratado (`store_metadata.ultimo_carrinho_id`). Ele só
 * anda por carrinho resolvido, em ordem: um carrinho novo demais (o cliente pode
 * ainda estar comprando) PARA a rodada daquela loja, e ele é relido na próxima.
 * Na primeira rodada de uma loja, o que é mais velho que um dia só move o
 * cursor — conectar a loja não pode disparar mensagem para o histórico inteiro.
 *
 * Auth: mesmo contrato dos demais crons. Audita SÓ quando entregou algo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { NuvemshopApiError } from "@/lib/nuvemshop/api-client";
import {
  clienteDaLoja,
  entregarNaCaptacao,
  fonteDaLoja,
  gravarNaLoja,
  lojasConectadas,
  marcarTokenRecusado,
  type LojaConectada,
} from "@/lib/nuvemshop/captacao";
import { avisoDoCarrinho } from "@/lib/nuvemshop/venda";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Quanto o carrinho precisa estar parado para contar como abandonado. */
export const ESPERA_MINUTOS = 30;
/** Carrinho mais velho que isto não vira mensagem (só move o cursor). */
export const IDADE_MAXIMA_HORAS = 24;
/** Teto de entregas por loja numa rodada (a Captação aceita 60 por minuto por fonte). */
const ENTREGAS_POR_LOJA = 40;
const POR_PAGINA = 100;
const PAGINAS_POR_LOJA = 5;

export interface ResultadoDosCarrinhos {
  lojas: number;
  entregues: number;
  ignorados: number;
  falhas: number;
}

type Carrinho = Record<string, unknown> & { id?: unknown; created_at?: unknown; updated_at?: unknown };

function idNumerico(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function quando(c: Carrinho): number | null {
  const t = Date.parse(String(c.updated_at ?? c.created_at ?? ""));
  return Number.isFinite(t) ? t : null;
}

/**
 * Decide o destino de cada carrinho, em ordem de id. Puro, para ser testado sem
 * rede: devolve os que viram aviso, os que só movem o cursor, e onde o cursor
 * para.
 */
export function triarCarrinhos(
  carrinhos: Carrinho[],
  agora: number,
): { entregar: Carrinho[]; cursor: number | null } {
  const ordenados = carrinhos
    .filter((c) => idNumerico(c.id) !== null)
    .sort((a, b) => idNumerico(a.id)! - idNumerico(b.id)!);
  const entregar: Carrinho[] = [];
  let cursor: number | null = null;
  for (const c of ordenados) {
    const t = quando(c);
    // Ainda pode estar comprando: para aqui e relê na próxima rodada.
    if (t !== null && agora - t < ESPERA_MINUTOS * 60_000) break;
    const velho = t !== null && agora - t > IDADE_MAXIMA_HORAS * 3_600_000;
    if (!velho) entregar.push(c);
    cursor = idNumerico(c.id);
  }
  return { entregar, cursor };
}

async function rodarLoja(
  admin: SupabaseClient,
  loja: LojaConectada,
  agora: number,
  requestId: string,
): Promise<{ entregues: number; ignorados: number; falhas: number }> {
  const conta = { entregues: 0, ignorados: 0, falhas: 0 };
  const api = await clienteDaLoja(admin, loja);
  if (!api) {
    conta.falhas++;
    return conta;
  }
  let desde = idNumerico(loja.storeMetadata.ultimo_carrinho_id) ?? 0;

  for (let pagina = 0; pagina < PAGINAS_POR_LOJA; pagina++) {
    let lote: Carrinho[];
    try {
      lote = await api.get<Carrinho[]>(`/checkouts?since_id=${desde}&per_page=${POR_PAGINA}`);
    } catch (err) {
      if (err instanceof NuvemshopApiError && (err.status === 401 || err.status === 403)) {
        await marcarTokenRecusado(admin, loja, `api_${err.status}_ao_ler_carrinhos`);
      } else if (!(err instanceof NuvemshopApiError && err.status === 429)) {
        logger.warn("[nuvemshop-checkouts] leitura falhou", {
          organization_id: loja.organizationId,
          error: (err as Error).message,
          requestId,
        });
      }
      conta.falhas++;
      return conta;
    }
    if (!Array.isArray(lote) || lote.length === 0) return conta;

    const { entregar, cursor } = triarCarrinhos(lote, agora);
    let ate = desde;
    let parou = false;
    for (const c of entregar) {
      if (conta.entregues >= ENTREGAS_POR_LOJA) {
        parou = true;
        break;
      }
      const aviso = avisoDoCarrinho(c);
      if (aviso) {
        const fonte = await fonteDaLoja(admin, loja);
        if (!fonte) {
          conta.falhas++;
          return conta;
        }
        const entrega = await entregarNaCaptacao(admin, fonte, aviso);
        if (entrega.tipo === "tentar_depois") {
          // Ritmo ou banco: o cursor fica antes deste, que volta na próxima rodada.
          parou = true;
          break;
        }
        if (entrega.tipo === "entregue") conta.entregues++;
        else conta.ignorados++;
      } else {
        conta.ignorados++;
      }
      ate = idNumerico(c.id) ?? ate;
    }
    // Sem interrupção, o cursor vai até o último resolvido do lote (os velhos inclusive).
    const novo = parou ? ate : Math.max(ate, cursor ?? desde);
    if (novo > desde) {
      await gravarNaLoja(admin, loja, { ultimo_carrinho_id: novo });
      desde = novo;
    }
    // Só segue para a página seguinte se este lote veio cheio e foi resolvido inteiro.
    const maiorDoLote = Math.max(...lote.map((c) => idNumerico(c.id) ?? 0));
    if (parou || lote.length < POR_PAGINA || novo < maiorDoLote) return conta;
  }
  return conta;
}

export async function lerCarrinhosAbandonados(
  admin: SupabaseClient,
  requestId: string,
  agora: number = Date.now(),
): Promise<ResultadoDosCarrinhos> {
  const lojas = await lojasConectadas(admin);
  const total: ResultadoDosCarrinhos = { lojas: lojas.length, entregues: 0, ignorados: 0, falhas: 0 };
  for (const loja of lojas) {
    try {
      const r = await rodarLoja(admin, loja, agora, requestId);
      total.entregues += r.entregues;
      total.ignorados += r.ignorados;
      total.falhas += r.falhas;
    } catch (err) {
      total.falhas++;
      logger.error("[nuvemshop-checkouts] loja falhou", {
        organization_id: loja.organizationId,
        error: err instanceof Error ? err.message : String(err),
        requestId,
      });
    }
  }
  return total;
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }
  let resultado: ResultadoDosCarrinhos;
  try {
    resultado = await lerCarrinhosAbandonados(createAdminClient(), requestId);
  } catch (err) {
    logger.error("[nuvemshop-checkouts] varredura falhou", {
      error: err instanceof Error ? err.message : String(err),
      requestId,
    });
    return fail("internal_error", "Failed to read abandoned checkouts.", 500, { requestId });
  }
  if (resultado.entregues > 0 || resultado.falhas > 0) {
    void audit({
      action: "nuvemshop.checkouts_run",
      organizationId: null,
      bypassedRls: true,
      metadata: { ...resultado },
      requestId,
    });
  }
  return ok(resultado, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
