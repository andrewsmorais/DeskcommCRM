/**
 * GET  /api/v1/setores — setores da organização, com os membros (agent+: quem
 *      atende precisa ver os setores para transferir).
 * POST /api/v1/setores — cria um setor (manager+). Corpo: { nome, descricao?, membros[] }.
 *
 * Setores (migration 0496) agrupam atendentes; a conversa com setor só é
 * distribuída a membros dele. A regra mora em lib/setores/servico.ts.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { validateRequest } from "@/lib/schemas/_validate";
import {
  gravarMembros,
  listarSetores,
  membrosRecusados,
  setorInputSchema,
} from "@/lib/setores/servico";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "setores" });
  if (!authz.ok) return authz.response;
  try {
    return ok(await listarSetores(await createClient(), authz.org.orgId), { requestId });
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "setores" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let input;
  try {
    input = await validateRequest(setorInputSchema, req);
  } catch (err) {
    if (err instanceof ApiError)
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    throw err;
  }

  const recusados = await membrosRecusados(createAdminClient(), orgId, input.membros);
  if (recusados.length > 0)
    return fail(
      "validation_error",
      t("Só atendentes ativos da equipe podem entrar num setor."),
      422,
      {
        details: { membros: recusados },
        requestId,
      },
    );

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const db = await createClient();
  const { data, error } = await db
    .from("setores")
    .insert({ organization_id: orgId, nome: input.nome, descricao: input.descricao ?? null })
    .select("id, nome, descricao")
    .single();
  if (error) {
    if (error.code === "23505")
      return fail("conflict", t("Já existe um setor com esse nome."), 409, { requestId });
    return fail("internal_error", error.message, 500, { requestId });
  }
  await gravarMembros(db, orgId, data.id, input.membros);

  await audit({
    action: "setor.created",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "setor",
    resourceId: data.id,
    metadata: { nome: data.nome, membros: input.membros.length },
    requestId,
  });
  return ok({ ...data, membros: [...new Set(input.membros)] }, { requestId, status: 201 });
}
