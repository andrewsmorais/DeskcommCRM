import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/visibilidade — oculta a conversa ou a mostra
 * de novo (migration 0510; régua em `lib/inbox/visibilidade.ts`).
 *
 * Oculta, a conversa sai da caixa de entrada (lista e contagem das abas) e
 * aparece no filtro "Ocultas"; o atendimento não é fechado. "Até a próxima
 * mensagem do contato" volta sozinha quando ele escreve (gatilho no banco).
 * O passo "Visibilidade da conversa" do chatbot não passa por aqui (o executor
 * grava com o service role).
 *
 * Quem pode: atendente para cima, em conversa que ele enxerga — quem decide
 * o "enxerga" é a RLS: a leitura e a escrita usam o client do usuário.
 *
 * Auth: cookie, role >= agent. Audit: `conversation.visibility_changed`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas/_validate";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { VISIBILIDADES, type Visibilidade } from "@/lib/inbox/visibilidade";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ visibilidade: z.enum(VISIBILIDADES) });

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let input;
  try {
    input = await validateRequest(bodySchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();
  // Lida com o client do usuário: conversa que ele não vê responde 404.
  const { data: atual } = await supabase
    .from("conversations")
    .select("id, visibilidade")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const conversa = atual as { id: string; visibilidade: Visibilidade } | null;
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  if (conversa.visibilidade === input.visibilidade) return ok(conversa, { requestId });

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const { data, error } = await supabase
    .from("conversations")
    .update({ visibilidade: input.visibilidade })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id, visibilidade")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  await audit({
    action: "conversation.visibility_changed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: id,
    metadata: { conversation_id: id, visibilidade: input.visibilidade, prev: conversa.visibilidade },
    requestId,
  });

  return ok(data, { requestId });
}
