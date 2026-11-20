/**
 * GET /api/v1/conversations/[id]/favoritas — as mensagens com estrela da
 * conversa (migration 0513), mais recentes primeiro. Leitura pela RLS da
 * sessão. Separada da lista de mensagens de propósito: se o banco ainda não
 * recebeu a 0513, só esta rota falha — a conversa continua abrindo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, type, direction, body, sent_at, favoritada_em")
    .eq("organization_id", authz.org.orgId)
    .eq("conversation_id", id)
    .not("favoritada_em", "is", null)
    .order("favoritada_em", { ascending: false })
    .limit(200);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}
