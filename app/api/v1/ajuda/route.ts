/**
 * O botão Ajuda do CRM.
 *
 * GET  → os contatos de suporte da instalação e se o chat está disponível
 *        (chave configurada) e quantas mensagens restam nas últimas 24 horas.
 * POST → uma pergunta ao assistente (Claude, chave própria da ajuda).
 *
 * A organização e o papel vêm da sessão (`requireRole`), nunca do corpo. O
 * corpo traz só a conversa, validada por `pedidoDeAjudaSchema`. Cada mensagem
 * respondida vira uma linha em `ajuda_mensagens` (limite diário, painel do
 * dono, custo) e um audit `ajuda.pergunta`.
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
import { requireSupportWrite } from "@/lib/impersonate/support";
import { valorDaInstalacao } from "@/lib/instalacao/config";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const admin = createAdminClient();
  const registro = criarRegistroDaAjuda(admin);
  const usadas = await registro.usadasNasUltimas24h(org.orgId);
  if (usadas >= LIMITE_DE_MENSAGENS_POR_DIA) {
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

  const id = await registro
    .registrar({
      organizationId: org.orgId,
      userId: user.id,
      pergunta: pedido.mensagem,
      resposta: resposta.texto,
      escalou: resposta.escalou,
      tela: pedido.tela ?? null,
      uso: resposta.uso,
    })
    .catch((err: unknown) => {
      // A resposta já existe: falhar o registro não pode esconder dela.
      logger.warn("[ajuda] registro falhou", {
        organization_id: org.orgId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
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
      restantes: Math.max(0, LIMITE_DE_MENSAGENS_POR_DIA - usadas - 1),
    },
    { requestId },
  );
}
