import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH  /api/v1/conversations/[id]/agendadas/[agendadaId] — muda o texto, o
 *        chatbot ou o horário de uma mensagem ainda agendada.
 * DELETE /api/v1/conversations/[id]/agendadas/[agendadaId] — cancela (a linha
 *        fica, com status `cancelada`, como histórico).
 *
 * Quem pode: quem agendou, ou gerente/admin. Só enquanto está `agendada`: o que
 * já saiu, falhou ou foi cancelado não muda. Mudar o horário grava um evento
 * novo; o antigo, quando vencer, encontra o horário no futuro (ou a linha já
 * enviada) e não faz nada — a troca condicional no worker garante um envio só.
 *
 * Auth: cookie, role >= agent. Audit: `scheduled_message.updated` / `.canceled`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  COLUNAS_DA_AGENDADA,
  agendadaSchema,
  problemaDoHorario,
  type MensagemAgendada,
} from "@/lib/agendadas/regras";
import { agendarEnvio, conversaVisivel, problemaDoPedido } from "@/lib/agendadas/servidor";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string; agendadaId: string }>;
}

type Autorizado =
  | { ok: false; response: Response }
  | {
      ok: true;
      requestId: string;
      t: (texto: string) => string;
      userId: string;
      orgId: string;
      linha: MensagemAgendada;
    };

async function autorizar(ctx: RouteCtx): Promise<Autorizado> {
  const requestId = randomUUID();
  const { id, agendadaId } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return { ok: false, response: authz.response };
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  // Leitura com o client do usuário: agendada de conversa que ele não vê é 404.
  const supabase = await createClient();
  const { data } = await supabase
    .from("mensagens_agendadas")
    .select(COLUNAS_DA_AGENDADA)
    .eq("organization_id", authz.org.orgId)
    .eq("conversation_id", id)
    .eq("id", agendadaId)
    .maybeSingle();
  const linha = data as unknown as MensagemAgendada | null;
  if (!linha)
    return { ok: false, response: fail("not_found", t("Agendamento não encontrado."), 404, { requestId }) };
  if (linha.criado_por !== authz.user.id && !roleAtLeast(authz.org.role, "manager"))
    return {
      ok: false,
      response: fail("forbidden", t("Só quem agendou ou um gerente pode mudar este agendamento."), 403, {
        requestId,
      }),
    };
  if (linha.status !== "agendada")
    return {
      ok: false,
      response: fail("conflict", t("Este agendamento já saiu, falhou ou foi cancelado."), 409, { requestId }),
    };
  return { ok: true, requestId, t, userId: authz.user.id, orgId: authz.org.orgId, linha };
}

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const a = await autorizar(ctx);
  if (!a.ok) return a.response;
  const { requestId, t, orgId, linha } = a;

  const corpo = agendadaSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    const primeiro = corpo.error.issues[0]?.message ?? "Pedido inválido.";
    return fail("validation_failed", t(primeiro), 422, { requestId });
  }
  const input = corpo.data;
  const horario = problemaDoHorario(input.enviar_em, new Date());
  if (horario) return fail("validation_failed", t(horario), 422, { requestId });

  const supabase = await createClient();
  const conversa = await conversaVisivel(supabase, orgId, linha.conversation_id);
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const problema = await problemaDoPedido(supabase, orgId, conversa, input);
  if (problema) return fail("validation_failed", t(problema), 422, { requestId });

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const admin = createAdminClient();
  const enviarEm = new Date(input.enviar_em).toISOString();
  // Condicional em `status = agendada`: se o worker pegou a linha entre a
  // leitura e aqui, a edição não passa por cima de um envio em andamento.
  const { data, error } = await admin
    .from("mensagens_agendadas")
    .update({
      tipo: input.tipo,
      texto: input.tipo === "chatbot" ? null : (input.texto ?? null),
      chatbot_flow_id: input.tipo === "chatbot" ? (input.chatbot_flow_id ?? null) : null,
      enviar_em: enviarEm,
    })
    .eq("organization_id", orgId)
    .eq("id", linha.id)
    .eq("status", "agendada")
    .select(COLUNAS_DA_AGENDADA)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("conflict", t("Este agendamento acabou de sair. Atualize a lista."), 409, { requestId });

  if (enviarEm !== new Date(linha.enviar_em).toISOString()) {
    const { error: erroDoEvento } = await agendarEnvio(admin, orgId, linha.id, enviarEm);
    if (erroDoEvento) return fail("internal_error", t("Não foi possível reagendar. Tente de novo."), 500, { requestId });
  }

  await audit({
    action: "scheduled_message.updated",
    actorUserId: a.userId,
    organizationId: orgId,
    resourceType: "mensagem_agendada",
    resourceId: linha.id,
    requestId,
    metadata: { conversation_id: linha.conversation_id, tipo: input.tipo, enviar_em: enviarEm },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const a = await autorizar(ctx);
  if (!a.ok) return a.response;
  const { requestId, t, orgId, linha } = a;

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mensagens_agendadas")
    .update({ status: "cancelada" })
    .eq("organization_id", orgId)
    .eq("id", linha.id)
    .eq("status", "agendada")
    .select(COLUNAS_DA_AGENDADA)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("conflict", t("Este agendamento acabou de sair. Atualize a lista."), 409, { requestId });

  await audit({
    action: "scheduled_message.canceled",
    actorUserId: a.userId,
    organizationId: orgId,
    resourceType: "mensagem_agendada",
    resourceId: linha.id,
    requestId,
    metadata: { conversation_id: linha.conversation_id, tipo: linha.tipo },
  });
  return ok(data, { requestId });
}
