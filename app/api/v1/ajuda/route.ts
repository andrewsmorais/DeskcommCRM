/**
 * O botão Ajuda do CRM.
 *
 * GET  → os contatos de suporte da instalação e se o chat está disponível
 *        (chave configurada) e quantas mensagens restam nas últimas 24 horas.
 * POST → uma pergunta ao assistente (Claude, chave própria da ajuda).
 *
 * A organização e o papel vêm da sessão (`requireRole`), nunca do corpo. O
 * corpo traz só a conversa, validada por `pedidoDeAjudaSchema`. Cada pergunta
 * que vai ao assistente RESERVA antes a sua linha em `ajuda_mensagens` (limite
 * diário, painel do dono, custo) — completada com a resposta depois — e gera um
 * audit `ajuda.pergunta`.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { marcaDaSaida } from "@/lib/branding/saida";
import {
  FalhaDoAssistente,
  pedidoDeAjudaSchema,
  perguntarAoAssistente,
} from "@/lib/ajuda/assistente";
import { contatosDeSuporte, contextoDoCliente } from "@/lib/ajuda/contexto";
import { parteDoCliente, parteFixa } from "@/lib/ajuda/prompt";
import { LIMITE_DE_MENSAGENS_POR_DIA, criarRegistroDaAjuda } from "@/lib/ajuda/registro";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ErroDaReservaDeCota } from "@/lib/billing/reserva";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { valorDaInstalacao } from "@/lib/instalacao/config";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Perguntas por PESSOA por minuto. Cada uma é uma chamada paga na chave da ajuda. */
const TETO_POR_USUARIO = 6;
/** Perguntas por EMPRESA por minuto — sem ele, 10 pessoas somam 60 por minuto. */
const TETO_POR_ORGANIZACAO = 20;
const JANELA_SEGUNDOS = 60;

async function chaveDaAjuda(): Promise<string | null> {
  const { valor } = await valorDaInstalacao("AJUDA_ANTHROPIC_API_KEY");
  const chave = (valor ?? "").trim();
  return chave.length >= 20 ? chave : null;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "ajuda" });
  if (!authz.ok) return authz.response;
  const [contato, chave] = await Promise.all([contatosDeSuporte(), chaveDaAjuda()]);
  let restantes = 0;
  if (chave) {
    const usadas = await criarRegistroDaAjuda(createAdminClient())
      .usadasNasUltimas24h(authz.org.orgId)
      .catch(() => 0);
    restantes = Math.max(0, LIMITE_DE_MENSAGENS_POR_DIA - usadas);
  }
  return ok({ contato, chat: { disponivel: Boolean(chave), restantes } }, { requestId });
}

export async function POST(request: Request): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "ajuda" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return fail("validation_failed", "Corpo inválido.", 400, { requestId });
  }
  const parsed = pedidoDeAjudaSchema.safeParse(corpo);
  if (!parsed.success) {
    return fail("validation_failed", "Mensagem inválida.", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const pedido = parsed.data;

  const chave = await chaveDaAjuda();
  if (!chave) {
    return fail("ajuda_nao_configurada", "O chat de ajuda não está ligado nesta instalação.", 503, {
      requestId,
    });
  }

  // Rajada por pessoa e por empresa, antes de tocar no banco — o mesmo par de
  // tetos da consulta paga do caso (`ai/cases/[id]/chat`). O teto do DIA é o
  // da reserva logo abaixo; este só impede que uma rajada o consuma de uma vez.
  const porUsuario = await checkRateLimit(`ajuda:${user.id}`, TETO_POR_USUARIO, JANELA_SEGUNDOS);
  const porOrganizacao = await checkRateLimit(
    `ajuda-org:${org.orgId}`,
    TETO_POR_ORGANIZACAO,
    JANELA_SEGUNDOS,
  );
  if (!porUsuario.allowed || !porOrganizacao.allowed) {
    const teto = porUsuario.allowed ? porOrganizacao : porUsuario;
    return fail("rate_limited", "Muitas perguntas seguidas. Tente de novo em um minuto.", 429, {
      requestId,
      headers: {
        "Retry-After": String(JANELA_SEGUNDOS),
        "X-RateLimit-Limit": String(teto.limit),
        "X-RateLimit-Remaining": String(Math.max(0, teto.limit - teto.count)),
      },
    });
  }

  const admin = createAdminClient();
  const registro = criarRegistroDaAjuda(admin);

  // A VAGA É TOMADA ANTES DA CHAMADA PAGA, dentro da reserva da organização
  // (`registro.reservar`). Contar antes e gravar depois deixava N pedidos
  // simultâneos passarem todos pelo teto; e a gravação que falhava depois era
  // engolida. Agora qualquer falha aqui recusa SEM chamar o modelo.
  let reserva: { id: string; usadas: number } | null;
  try {
    reserva = await registro.reservar({
      organizationId: org.orgId,
      userId: user.id,
      pergunta: pedido.mensagem,
      tela: pedido.tela ?? null,
    });
  } catch (err) {
    if (err instanceof ErroDaReservaDeCota && err.status === 409) {
      return fail(
        "rate_limited",
        "Outra pergunta da sua empresa está sendo registrada agora. Tente de novo em instantes.",
        429,
        { requestId, headers: { "Retry-After": "2" } },
      );
    }
    logger.warn("[ajuda] não foi possível reservar a mensagem — recusada sem chamar o assistente", {
      organization_id: org.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail(
      "ajuda_indisponivel",
      "O chat de ajuda não conseguiu registrar a pergunta agora. Tente de novo em instantes.",
      503,
      { requestId },
    );
  }
  if (!reserva) {
    return fail(
      "rate_limited",
      "Sua empresa usou as mensagens de hoje do chat de ajuda. Fale com a equipe pelo WhatsApp ou pelo e-mail.",
      429,
      { requestId, headers: { "Retry-After": "3600" } },
    );
  }

  const marca = await marcaDaSaida(org.orgId);
  const cliente = await contextoDoCliente(admin, {
    organizationId: org.orgId,
    role: org.role,
    isPlatformAdmin: Boolean(user.is_platform_admin),
    marca: marca.nome,
  });

  let resposta;
  try {
    resposta = await perguntarAoAssistente({
      chave,
      sistemaFixo: parteFixa(marca.nome),
      sistemaDoCliente: parteDoCliente(cliente),
      pedido,
    });
  } catch (err) {
    const motivo = err instanceof FalhaDoAssistente ? err.motivo : "indisponivel";
    logger.warn("[ajuda] assistente falhou", {
      organization_id: org.orgId,
      motivo,
      detalhe: err instanceof Error ? err.message : String(err),
    });
    return fail(
      "ajuda_indisponivel",
      "O assistente não conseguiu responder agora. Tente de novo ou fale com a equipe.",
      motivo === "recusado" ? 503 : 502,
      { requestId },
    );
  }

  // A vaga já foi contada na reserva; aqui só se completa a linha. Falhar isto
  // não esconde a resposta de quem perguntou — e não devolve vaga nenhuma.
  const id = reserva.id;
  await registro
    .concluir(org.orgId, id, {
      resposta: resposta.texto,
      escalou: resposta.escalou,
      uso: resposta.uso,
    })
    .catch((err: unknown) => {
      logger.warn("[ajuda] registro da resposta falhou", {
        organization_id: org.orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  void audit({
    action: "ajuda.pergunta",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ajuda_mensagens",
    resourceId: id,
    requestId,
    metadata: { escalou: resposta.escalou, com_imagem: Boolean(pedido.imagem) },
  });

  return ok(
    {
      resposta: resposta.texto,
      escalou: resposta.escalou,
      restantes: Math.max(0, LIMITE_DE_MENSAGENS_POR_DIA - reserva.usadas),
    },
    { requestId },
  );
}
