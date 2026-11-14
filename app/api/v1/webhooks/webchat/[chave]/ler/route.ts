/**
 * Chat no site — o balão lê a conversa do visitante (pública).
 *
 * `POST /api/v1/webhooks/webchat/<chave>/ler`, corpo `text/plain` com JSON
 * `{ visitante, depois? }`. POST e não GET porque o token do visitante é
 * segredo e não pode ir na URL (vai parar em log de proxy).
 *
 * Só a conversa deste token, só texto, sem nota interna. Ler é também o "lido"
 * das respostas do atendente.
 */
import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { getIp } from "@/lib/rate-limit-helper";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { leituraDoVisitanteSchema } from "@/lib/channels/webchat/config";
import { lerDoVisitante } from "@/lib/channels/webchat/ingest";
import {
  cabecalhosDoBalao,
  canalPelaChave,
  erroDoBalao,
  lerCorpoDoBalao,
  origemDoPedido,
  origemRecusada,
  respostaDoBalao,
} from "@/lib/channels/webchat/publico";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ chave: string }> };

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return new Response(null, { status: 204, headers: cabecalhosDoBalao(origemDoPedido(req)) });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const origem = origemDoPedido(req);
  // O balão aberto lê a cada 3 s: 40/min por IP dá folga para duas abas.
  if (!checkRateLimit(`webchat:ler:${getIp(req)}`, 40, 60_000).ok)
    return erroDoBalao(429, "rate_limited", "Muitas solicitações. Aguarde um pouco.", origem);

  const { chave } = await ctx.params;
  const admin = createAdminClient();
  const canal = await canalPelaChave(admin, chave);
  if (!canal) return erroDoBalao(404, "not_found", "Chat não encontrado.", origem);
  const dominios = canal.config.dominios;
  if (origemRecusada(canal, origem))
    return erroDoBalao(403, "origin_not_allowed", "Este site não pode mostrar este chat.", origem, dominios);

  const lido = leituraDoVisitanteSchema.safeParse(await lerCorpoDoBalao(req));
  if (!lido.success)
    return erroDoBalao(422, "validation_failed", "Pedido inválido.", origem, dominios);

  try {
    const mensagens = await lerDoVisitante(admin, {
      organizationId: canal.organizationId,
      canalId: canal.id,
      token: lido.data.visitante,
      depois: lido.data.depois,
    });
    return respostaDoBalao({ data: { mensagens } }, 200, origem, dominios);
  } catch (error) {
    logger.error("[webchat] falha ao ler a conversa do visitante", {
      organization_id: canal.organizationId,
      channel_session_id: canal.id,
      detail: error instanceof Error ? error.message : String(error),
    });
    return erroDoBalao(500, "internal_error", "Não foi possível carregar agora.", origem, dominios);
  }
}
