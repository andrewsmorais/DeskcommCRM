/**
 * Chat no site — o visitante manda uma mensagem (pública).
 *
 * `POST /api/v1/webhooks/webchat/<chave>/enviar`, corpo `text/plain` com JSON
 * (ver `lib/channels/webchat/publico.ts` para o porquê):
 * `{ visitante, id, texto, nome?, email?, pagina? }`.
 *
 * A organização e o canal saem da chave, no servidor; o corpo só diz QUEM é o
 * visitante (token, que o banco guarda como hash) e O QUE ele escreveu.
 * Reenviar o mesmo `id` não duplica.
 */
import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { getIp } from "@/lib/rate-limit-helper";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { envioDoVisitanteSchema, hashDoVisitante } from "@/lib/channels/webchat/config";
import { receberDoVisitante, VisitantesNovosDemais, VisitanteEncerrado } from "@/lib/channels/webchat/ingest";
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

/** Tetos por CANAL (por processo): um site movimentado cabe com folga; uma enxurrada, não. */
const MENSAGENS_POR_MINUTO_NO_CANAL = 300;
const VISITANTES_NOVOS_POR_MINUTO = 20;
const VISITANTES_NOVOS_POR_HORA = 300;

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return new Response(null, { status: 204, headers: cabecalhosDoBalao(origemDoPedido(req)) });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const origem = origemDoPedido(req);
  const ip = getIp(req);
  if (!checkRateLimit(`webchat:enviar:ip:${ip}`, 60, 60_000).ok)
    return erroDoBalao(429, "rate_limited", "Muitas mensagens seguidas. Aguarde um pouco.", origem);

  const { chave } = await ctx.params;
  const admin = createAdminClient();
  const canal = await canalPelaChave(admin, chave);
  if (!canal) return erroDoBalao(404, "not_found", "Chat não encontrado.", origem);
  const dominios = canal.config.dominios;
  if (origemRecusada(canal, origem))
    return erroDoBalao(403, "origin_not_allowed", "Este site não pode mostrar este chat.", origem, dominios);

  const corpo = await lerCorpoDoBalao(req);
  const lido = envioDoVisitanteSchema.safeParse(corpo);
  if (!lido.success)
    return erroDoBalao(422, "validation_failed", "Mensagem inválida.", origem, dominios);

  // Por visitante também: um token só não inunda a Inbox, mesmo trocando de IP.
  const visitante = hashDoVisitante(lido.data.visitante);
  if (!checkRateLimit(`webchat:enviar:visitante:${visitante}`, 15, 60_000).ok)
    return erroDoBalao(429, "rate_limited", "Muitas mensagens seguidas. Aguarde um pouco.", origem, dominios);

  // Teto do CANAL, que quem chama não escolhe: o IP pode vir de um cabeçalho
  // que o proxy só repassa, e o token do visitante é inventado no navegador.
  if (!checkRateLimit(`webchat:enviar:canal:${canal.id}`, MENSAGENS_POR_MINUTO_NO_CANAL, 60_000).ok)
    return erroDoBalao(429, "rate_limited", "Muitas mensagens agora. Tente de novo em instantes.", origem, dominios);

  try {
    const desfecho = await receberDoVisitante(
      admin,
      {
        organizationId: canal.organizationId,
        canalId: canal.id,
        token: lido.data.visitante,
        mensagemId: lido.data.id,
        texto: lido.data.texto,
        nome: lido.data.nome,
        email: lido.data.email,
        pagina: lido.data.pagina,
      },
      {
        podeNascerVisitante: () =>
          checkRateLimit(`webchat:novos:minuto:${canal.id}`, VISITANTES_NOVOS_POR_MINUTO, 60_000).ok &&
          checkRateLimit(`webchat:novos:hora:${canal.id}`, VISITANTES_NOVOS_POR_HORA, 3_600_000).ok,
      },
    );
    return respostaDoBalao(
      {
        data: {
          id: desfecho.status === "ingested" ? desfecho.messageId : null,
          repetida: desfecho.status === "duplicate",
        },
      },
      desfecho.status === "ingested" ? 201 : 200,
      origem,
      dominios,
    );
  } catch (error) {
    if (error instanceof VisitanteEncerrado)
      return erroDoBalao(410, "visitor_reset", "Esta conversa foi encerrada. Comece uma nova.", origem, dominios);
    if (error instanceof VisitantesNovosDemais) {
      logger.warn("[webchat] teto de visitantes novos do canal atingido", {
        organization_id: canal.organizationId,
        channel_session_id: canal.id,
      });
      return erroDoBalao(429, "rate_limited", "Muitas conversas novas agora. Tente de novo em instantes.", origem, dominios);
    }
    logger.error("[webchat] falha ao receber mensagem do visitante", {
      organization_id: canal.organizationId,
      channel_session_id: canal.id,
      detail: error instanceof Error ? error.message : String(error),
    });
    return erroDoBalao(500, "internal_error", "Não foi possível enviar agora. Tente de novo.", origem, dominios);
  }
}
