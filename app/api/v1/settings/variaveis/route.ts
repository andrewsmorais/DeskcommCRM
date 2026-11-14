import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET/PATCH /api/v1/settings/variaveis — Configurações › Variáveis da empresa.
 *
 * GET (atendente ou acima): a lista, para o campo de mensagem preencher as
 * respostas rápidas e o editor de chatbot mostrar o que existe.
 *
 * PATCH (gerente ou acima): troca a lista inteira em
 * `organizations.settings.variaveis`, sem tocar nas outras chaves de `settings`.
 * A auditoria guarda os NOMES que entraram, saíram ou mudaram — nunca os
 * valores, que podem ser uma chave Pix ou um link interno.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { lerVariaveisDaEmpresa, variaveisDaEmpresaSchema } from "@/lib/empresa/variaveis";
import { validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({ variaveis: variaveisDaEmpresaSchema });

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(
    { variaveis: lerVariaveisDaEmpresa((org as { settings?: unknown } | null)?.settings) },
    { requestId },
  );
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "settings_routing" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(corpoSchema, req);
  } catch (err) {
    if (err instanceof ApiError)
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    throw err;
  }

  const admin = createAdminClient();
  const { data: orgRow, error: readErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (readErr) return fail("internal_error", readErr.message, 500, { requestId });
  const atuais = ((orgRow?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const anteriores = lerVariaveisDaEmpresa(atuais);

  const { error: updErr } = await admin
    .from("organizations")
    .update({ settings: { ...atuais, variaveis: input.variaveis } })
    .eq("id", authz.org.orgId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  const antes = new Map(anteriores.map((v) => [v.chave, v.valor]));
  const depois = new Map(input.variaveis.map((v) => [v.chave, v.valor]));
  void audit({
    action: "organization_variables.changed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: {
      criadas: [...depois.keys()].filter((k) => !antes.has(k)),
      removidas: [...antes.keys()].filter((k) => !depois.has(k)),
      alteradas: [...depois.keys()].filter((k) => antes.has(k) && antes.get(k) !== depois.get(k)),
      total: input.variaveis.length,
    },
  });

  return ok({ variaveis: input.variaveis }, { requestId });
}
