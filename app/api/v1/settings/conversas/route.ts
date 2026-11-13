import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET/PATCH /api/v1/settings/conversas — Configurações › Conversas.
 *
 * GET (atendente ou acima): o que a empresa decidiu sobre assinatura e o botão
 * Fechar, mais o perfil de quem pergunta (nome, assinatura e despedida
 * pessoal). É o que o campo de mensagem e a janela Fechar precisam saber.
 *
 * PATCH (gerente ou acima): grava `organizations.settings.conversas`, sem tocar
 * nas outras chaves de `settings`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { temPassoFinalizar } from "@/lib/chatbot/iniciar-manual";
import { inicioManual } from "@/lib/chatbot/motor";
import { grafoSchema } from "@/lib/chatbot/passos";
import { lerPreferenciasDeConversa, preferenciasDeConversaSchema } from "@/lib/conversas/preferencias";
import { traduzir } from "@/lib/i18n/dicionario";
import { validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const [{ data: org, error }, { data: sessao }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", authz.org.orgId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const meta = (sessao.user?.user_metadata ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  return ok(
    {
      ...lerPreferenciasDeConversa((org as { settings?: unknown } | null)?.settings),
      meu: {
        nome: texto(meta.full_name) ?? texto(meta.name),
        assinatura: texto(meta.assinatura),
        mensagem_de_finalizacao: texto(meta.mensagem_de_finalizacao),
      },
    },
    { requestId },
  );
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "settings_routing" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);

  let input;
  try {
    input = await validateRequest(preferenciasDeConversaSchema, req);
  } catch (err) {
    if (err instanceof ApiError)
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    throw err;
  }

  const admin = createAdminClient();
  // O chatbot padrão tem de ser DESTA empresa. O id vem do corpo; sem conferir,
  // uma empresa gravaria um fluxo de outra como sugestão.
  if (input.finalizar.chatbot_padrao) {
    const { data: fluxo } = await admin
      .from("chatbot_flows")
      .select("id, grafo")
      .eq("id", input.finalizar.chatbot_padrao)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    if (!fluxo) return fail("validation_failed", t("Chatbot não encontrado."), 422, { requestId });
    // A mesma régua do Fechar: sem "Iniciar manualmente" ele não é acionável
    // pela conversa, e sem "Finalizar conversa" a conversa nunca fecharia.
    const g = grafoSchema.safeParse((fluxo as { grafo?: unknown }).grafo);
    if (!g.success || !inicioManual(g.data) || !temPassoFinalizar(g.data))
      return fail(
        "validation_failed",
        t('O chatbot de encerramento precisa ter os passos "Iniciar manualmente" e "Finalizar conversa".'),
        422,
        { requestId },
      );
  }
  if (input.finalizar.comportamento === "mensagem" && !input.finalizar.mensagem_padrao)
    return fail(
      "validation_failed",
      t("Escreva a mensagem padrão: com esta opção, toda conversa fecha com uma despedida."),
      422,
      { requestId },
    );
  if (input.finalizar.comportamento === "chatbot" && !input.finalizar.chatbot_padrao)
    return fail(
      "validation_failed",
      t("Escolha o chatbot padrão: com esta opção, toda conversa fecha por um chatbot."),
      422,
      { requestId },
    );

  const { data: orgRow, error: readErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (readErr) return fail("internal_error", readErr.message, 500, { requestId });
  const atuais = ((orgRow?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const anterior = lerPreferenciasDeConversa(atuais);

  const { error: updErr } = await admin
    .from("organizations")
    .update({ settings: { ...atuais, conversas: input } })
    .eq("id", authz.org.orgId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  void audit({
    action: "conversation_settings.changed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: {
      antes: { assinatura: anterior.assinatura, finalizar: anterior.finalizar.comportamento },
      depois: { assinatura: input.assinatura, finalizar: input.finalizar.comportamento },
    },
  });

  return ok(input, { requestId });
}
