/**
 * PATCH  /api/v1/setores/[id] — muda nome, descrição e/ou membros (a lista
 *        enviada substitui a anterior). manager+.
 * DELETE /api/v1/setores/[id] — apaga o setor (manager+). As conversas dele
 *        ficam sem setor (FK `on delete set null (setor_id)`, migration 0496).
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
import { gravarMembros, membrosRecusados, setorInputSchema } from "@/lib/setores/servico";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const patchSchema = setorInputSchema.partial();

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "setores" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let input;
  try {
    input = await validateRequest(patchSchema, req);
  } catch (err) {
    if (err instanceof ApiError)
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    throw err;
  }

  const db = await createClient();
  const { data: atual } = await db
    .from("setores")
    .select("id, nome, descricao")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!atual) return fail("not_found", t("Setor não encontrado."), 404, { requestId });

  if (input.membros) {
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
  }

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const mudancas: Record<string, unknown> = {};
  if (input.nome !== undefined) mudancas.nome = input.nome;
  if (input.descricao !== undefined) mudancas.descricao = input.descricao ?? null;
  if (Object.keys(mudancas).length > 0) {
    mudancas.updated_at = new Date().toISOString();
    const { error } = await db
      .from("setores")
      .update(mudancas)
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) {
      if (error.code === "23505")
        return fail("conflict", t("Já existe um setor com esse nome."), 409, { requestId });
      return fail("internal_error", error.message, 500, { requestId });
    }
  }
  if (input.membros) await gravarMembros(db, orgId, id, input.membros);

  await audit({
    action: "setor.updated",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "setor",
    resourceId: id,
    metadata: {
      campos: Object.keys(mudancas).filter((k) => k !== "updated_at"),
      membros: input.membros?.length ?? null,
      nome_antes: atual.nome,
    },
    requestId,
  });
  return ok({ id }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "setores" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const db = await createClient();
  const { data: atual } = await db
    .from("setores")
    .select("id, nome")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!atual) return fail("not_found", t("Setor não encontrado."), 404, { requestId });

  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const { error } = await db.from("setores").delete().eq("organization_id", orgId).eq("id", id);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "setor.deleted",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "setor",
    resourceId: id,
    metadata: { nome: atual.nome },
    requestId,
  });
  return ok({ id }, { requestId });
}
