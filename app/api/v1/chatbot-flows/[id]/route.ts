/**
 * GET    /api/v1/chatbot-flows/[id]  — busca fluxo com nodes e edges
 * PATCH  /api/v1/chatbot-flows/[id]  — atualiza metadados OU salva canvas inteiro
 * DELETE /api/v1/chatbot-flows/[id]  — remove fluxo
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NodeSchema = z.object({
  id: z.string().uuid().optional(), // omitir = novo nó
  node_type: z.string().min(1),
  label: z.string().default(""),
  pos_x: z.number().default(0),
  pos_y: z.number().default(0),
  data: z.record(z.string(), z.unknown()).default({}),
});

const EdgeSchema = z.object({
  id: z.string().uuid().optional(),
  source_node_id: z.string().uuid(),
  target_node_id: z.string().uuid(),
  source_handle: z.string().optional(),
  target_handle: z.string().optional(),
  label: z.string().optional(),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  is_active: z.boolean().optional(),
  trigger_channel: z.string().uuid().optional().nullable(),
  // canvas completo — substitui nodes e edges
  nodes: z.array(NodeSchema).optional(),
  edges: z.array(EdgeSchema).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const requestId = randomUUID();
  const auth = await requireRole("agent");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const db = await createClient();

  const [flowRes, nodesRes, edgesRes] = await Promise.all([
    db
      .from("chatbot_flows")
      .select("*")
      .eq("id", id)
      .eq("organization_id", auth.org.orgId)
      .maybeSingle(),
    db
      .from("chatbot_nodes")
      .select("*")
      .eq("flow_id", id)
      .eq("organization_id", auth.org.orgId)
      .order("created_at"),
    db
      .from("chatbot_edges")
      .select("*")
      .eq("flow_id", id)
      .eq("organization_id", auth.org.orgId)
      .order("created_at"),
  ]);

  if (flowRes.error) return fail("db_error", flowRes.error.message, 500, { requestId });
  if (!flowRes.data) return fail("not_found", "Flow not found.", 404, { requestId });

  return ok(
    { ...flowRes.data, nodes: nodesRes.data ?? [], edges: edgesRes.data ?? [] },
    { requestId },
  );
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Invalid input.", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = await createClient();

  // Verificar que o fluxo pertence à org
  const { data: existing } = await db
    .from("chatbot_flows")
    .select("id")
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (!existing) return fail("not_found", "Flow not found.", 404, { requestId });

  const { nodes, edges, ...meta } = parsed.data;

  // Atualiza metadados se vieram
  if (Object.keys(meta).length > 0) {
    const { error } = await db
      .from("chatbot_flows")
      .update({ ...meta, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", auth.org.orgId);
    if (error) return fail("db_error", error.message, 500, { requestId });
  }

  // Substitui canvas se nodes vieram
  if (nodes !== undefined) {
    // Apaga nodes antigos (edges cascadeiam)
    await db.from("chatbot_nodes").delete().eq("flow_id", id).eq("organization_id", auth.org.orgId);

    if (nodes.length > 0) {
      // Mapa de id temporário → id definitivo para referenciar em edges
      const nodeInserts = nodes.map((n) => ({
        id: n.id ?? randomUUID(),
        organization_id: auth.org.orgId,
        flow_id: id,
        node_type: n.node_type,
        label: n.label,
        pos_x: n.pos_x,
        pos_y: n.pos_y,
        data: n.data,
      }));
      const { error } = await db.from("chatbot_nodes").insert(nodeInserts);
      if (error) return fail("db_error", error.message, 500, { requestId });
    }
  }

  if (edges !== undefined) {
    await db.from("chatbot_edges").delete().eq("flow_id", id).eq("organization_id", auth.org.orgId);
    if (edges.length > 0) {
      const edgeInserts = edges.map((e) => ({
        id: e.id ?? randomUUID(),
        organization_id: auth.org.orgId,
        flow_id: id,
        source_node_id: e.source_node_id,
        target_node_id: e.target_node_id,
        source_handle: e.source_handle ?? null,
        target_handle: e.target_handle ?? null,
        label: e.label ?? null,
      }));
      const { error } = await db.from("chatbot_edges").insert(edgeInserts);
      if (error) return fail("db_error", error.message, 500, { requestId });
    }
  }

  await audit({
    action: "chatbot_flow.updated",
    organizationId: auth.org.orgId,
    actorUserId: auth.user.id,
    resourceType: "chatbot_flow",
    resourceId: id,
    requestId,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent"),
  });

  return ok({ id }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const db = await createClient();

  const { error } = await db
    .from("chatbot_flows")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.org.orgId);

  if (error) return fail("db_error", error.message, 500, { requestId });

  await audit({
    action: "chatbot_flow.deleted",
    organizationId: auth.org.orgId,
    actorUserId: auth.user.id,
    resourceType: "chatbot_flow",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}
