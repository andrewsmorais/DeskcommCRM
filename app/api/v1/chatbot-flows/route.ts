/**
 * GET  /api/v1/chatbot-flows  — lista fluxos da organização
 * POST /api/v1/chatbot-flows  — cria novo fluxo
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { grafoSchema } from "@/lib/chatbot/passos";
import { inicioManual, inicioPorAutomacao } from "@/lib/chatbot/motor";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  trigger_channel: z.string().uuid().optional(),
});

export async function GET(_req: NextRequest) {
  const requestId = randomUUID();
  const auth = await requireRole("agent");
  if (!auth.ok) return auth.response;

  const db = await createClient();
  const { data, error } = await db
    .from("chatbot_flows")
    .select("id, name, description, status, is_active, trigger_channel, created_at, updated_at, grafo")
    .eq("organization_id", auth.org.orgId)
    .order("created_at", { ascending: false });

  if (error) return fail("db_error", error.message, 500, { requestId });

  // O desenho não sai na lista (ele traz o segredo cifrado do WebHook); sai só
  // o que a escolha da automação precisa saber: o fluxo começa por automação?
  const lista = (data ?? []).map(({ grafo, ...fluxo }) => {
    const g = grafoSchema.safeParse(grafo);
    return {
      ...fluxo,
      inicia_por_automacao: g.success && inicioPorAutomacao(g.data) !== null,
      inicia_manualmente: g.success && inicioManual(g.data) !== null,
    };
  });
  return ok(lista, { requestId });
}

export async function POST(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Invalid input.", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = await createClient();
  const { data, error } = await db
    .from("chatbot_flows")
    .insert({
      organization_id: auth.org.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      trigger_channel: parsed.data.trigger_channel ?? null,
      created_by: auth.user.id,
    })
    .select("id, name, description, status, is_active, trigger_channel, created_at, updated_at")
    .single();

  if (error) return fail("db_error", error.message, 500, { requestId });

  await audit({
    action: "chatbot_flow.created",
    organizationId: auth.org.orgId,
    actorUserId: auth.user.id,
    resourceType: "chatbot_flow",
    resourceId: data.id,
    requestId,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent"),
  });

  return ok(data, { status: 201, requestId });
}
