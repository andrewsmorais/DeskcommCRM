import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/conversations/[id]/agendadas — as mensagens agendadas desta conversa.
 * POST /api/v1/conversations/[id]/agendadas — agenda uma mensagem, uma nota ou
 * um chatbot para um dia e hora (migration 0511; régua em lib/agendadas).
 *
 * Quem lê é quem enxerga a conversa (RLS de `mensagens_agendadas`). Quem agenda
 * é atendente para cima, em conversa que enxerga. A gravação usa a service role
 * (a tabela é server-only) com `organization_id` da sessão; o horário vira um
 * evento que o worker drena e envia em nome de quem agendou.
 *
 * Auth: cookie, role >= viewer (GET) / agent (POST). Audit: `scheduled_message.created`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  COLUNAS_DA_AGENDADA,
  agendadaSchema,
  problemaDoHorario,
} from "@/lib/agendadas/regras";
import { agendarEnvio, conversaVisivel, problemaDoPedido } from "@/lib/agendadas/servidor";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mensagens_agendadas")
    .select(COLUNAS_DA_AGENDADA)
    .eq("organization_id", authz.org.orgId)
    .eq("conversation_id", id)
    .order("enviar_em", { ascending: true })
    .limit(200);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const corpo = agendadaSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    const primeiro = corpo.error.issues[0]?.message ?? "Pedido inválido.";
    return fail("validation_failed", t(primeiro), 422, { requestId });
  }
  const input = corpo.data;
  const horario = problemaDoHorario(input.enviar_em, new Date());
  if (horario) return fail("validation_failed", t(horario), 422, { requestId });

  const supabase = await createClient();
  const conversa = await conversaVisivel(supabase, org.orgId, id);
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const problema = await problemaDoPedido(supabase, org.orgId, conversa, input);
  if (problema) return fail("validation_failed", t(problema), 422, { requestId });

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mensagens_agendadas")
    .insert({
      organization_id: org.orgId,
      conversation_id: conversa.id,
      contact_id: conversa.contact_id,
      tipo: input.tipo,
      texto: input.tipo === "chatbot" ? null : (input.texto ?? null),
      chatbot_flow_id: input.tipo === "chatbot" ? (input.chatbot_flow_id ?? null) : null,
      enviar_em: new Date(input.enviar_em).toISOString(),
      criado_por: user.id,
    })
    .select(COLUNAS_DA_AGENDADA)
    .single();
  if (error || !data) return fail("internal_error", error?.message ?? "insert_failed", 500, { requestId });
  const linha = data as unknown as { id: string; enviar_em: string };

  const { error: erroDoEvento } = await agendarEnvio(admin, org.orgId, linha.id, linha.enviar_em);
  if (erroDoEvento) {
    // Sem o evento, a linha nunca sairia: desfaz para a tela não mostrar um
    // agendamento que não vai acontecer.
    await admin.from("mensagens_agendadas").delete().eq("organization_id", org.orgId).eq("id", linha.id);
    return fail("internal_error", t("Não foi possível agendar. Tente de novo."), 500, { requestId });
  }

  await audit({
    action: "scheduled_message.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "mensagem_agendada",
    resourceId: linha.id,
    requestId,
    metadata: { conversation_id: conversa.id, tipo: input.tipo, enviar_em: linha.enviar_em },
  });

  return ok(data, { requestId });
}
