/**
 * Chat no site — configuração do balão (pública).
 *
 * `GET /api/v1/webhooks/webchat/<chave>`: o script do balão pede a aparência
 * (título, saudação, cor) ao abrir. A chave é pública; nada aqui identifica
 * visitante ou conversa. Mora sob `webhooks/` porque é a mesma natureza: quem
 * chama é alguém de fora, sem sessão, e a organização sai do servidor.
 */
import type { NextRequest } from "next/server";

import { getIp } from "@/lib/rate-limit-helper";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cabecalhosDoBalao,
  canalPelaChave,
  erroDoBalao,
  origemDoPedido,
  origemRecusada,
  respostaDoBalao,
} from "@/lib/channels/webchat/publico";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ chave: string }> };

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return new Response(null, { status: 204, headers: cabecalhosDoBalao(origemDoPedido(req)) });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const origem = origemDoPedido(req);
  if (!checkRateLimit(`webchat:config:${getIp(req)}`, 60, 60_000).ok)
    return erroDoBalao(429, "rate_limited", "Muitas solicitações. Aguarde um pouco.", origem);
  const { chave } = await ctx.params;
  const canal = await canalPelaChave(createAdminClient(), chave);
  if (!canal) return erroDoBalao(404, "not_found", "Chat não encontrado.", origem);
  if (origemRecusada(canal, origem))
    return erroDoBalao(403, "origin_not_allowed", "Este site não pode mostrar este chat.", origem, canal.config.dominios);
  const { titulo, saudacao, cor, pedir_nome } = canal.config;
  return respostaDoBalao(
    { data: { titulo, saudacao, cor, pedir_nome } },
    200,
    origem,
    canal.config.dominios,
  );
}
