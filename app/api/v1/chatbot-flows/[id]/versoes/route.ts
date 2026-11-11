/**
 * GET /api/v1/chatbot-flows/:id/versoes — as versões publicadas do fluxo, da
 * mais nova para a mais velha (pendência V1 da auditoria funcional). Só o
 * número, quando e quem: o desenho de cada uma sai só ao restaurar.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const requestId = randomUUID();
  const auth = await requireRole("agent");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const db = await createClient();
  const { data, error } = await db
    .from("chatbot_flow_versions")
    .select("id, numero, publicada_em, publicada_por")
    .eq("organization_id", auth.org.orgId)
    .eq("flow_id", id)
    .order("numero", { ascending: false })
    .limit(50);
  if (error) return fail("internal_error", "Não foi possível ler as versões.", 500, { requestId });
  return ok(data ?? [], { requestId });
}
