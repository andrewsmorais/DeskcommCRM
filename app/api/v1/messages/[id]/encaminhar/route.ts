/**
 * POST /api/v1/messages/[id]/encaminhar — encaminhar uma mensagem para outras
 * conversas (até 5), como na Umbler Talk.
 *
 * Origem e destinos são lidos com o client da SESSÃO: quem não enxerga a
 * mensagem ou a conversa de destino não encaminha. O envio é o mesmo da tela
 * (`sendMessageHandler`, em nome de quem encaminhou). Texto vai como texto;
 * foto, vídeo, áudio e documento reaproveitam o arquivo já guardado. Mensagem
 * apagada não se encaminha.
 */
import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import type { SendMessageInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

const corpo = z.object({ conversation_ids: z.array(z.string().uuid()).min(1).max(5) });
const TIPOS = new Set(["text", "image", "video", "audio", "document"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const pedido = corpo.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !pedido.success)
    return fail("validation_failed", t("Escolha para onde encaminhar."), 422, { requestId });

  const supabase = await createClient();
  const { data: original } = await supabase
    .from("messages")
    .select("id, type, body, media_storage_path, media_mime, media_size_bytes, revoked_at, conversation_id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!original) return fail("not_found", t("Mensagem não encontrada."), 404, { requestId });
  const m = original as {
    type: string;
    body: string | null;
    media_storage_path: string | null;
    media_mime: string | null;
    media_size_bytes: number | null;
    revoked_at: string | null;
    conversation_id: string;
  };
  if (m.revoked_at || !TIPOS.has(m.type) || (m.type !== "text" && !m.media_storage_path) || (m.type === "text" && !m.body))
    return fail("validation_failed", t("Esta mensagem não pode ser encaminhada."), 422, { requestId });

  const resultados: { conversation_id: string; ok: boolean; erro?: string }[] = [];
  for (const destino of [...new Set(pedido.data.conversation_ids)]) {
    const { data: visivel } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", destino)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    if (!visivel) {
      resultados.push({ conversation_id: destino, ok: false, erro: t("Conversa não encontrada.") });
      continue;
    }
    const input = {
      conversation_id: destino,
      type: m.type,
      ...(m.body ? { body: m.body } : {}),
      ...(m.type !== "text"
        ? {
            media_storage_path: m.media_storage_path,
            media_mime: m.media_mime ?? undefined,
            media_size_bytes: m.media_size_bytes ?? undefined,
          }
        : {}),
      metadata: { encaminhada_de: id },
    } as SendMessageInput;
    try {
      const enviada = await sendMessageHandler(
        supabase,
        {
          organization_id: authz.org.orgId,
          actor: { type: "user", id: authz.user.id, role: authz.org.role },
          requestId,
          idioma: authz.user.idioma,
        },
        input,
      );
      resultados.push({ conversation_id: destino, ok: enviada.status !== "failed" });
    } catch (err) {
      resultados.push({
        conversation_id: destino,
        ok: false,
        erro: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }

  void audit({
    action: "message.forwarded",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message",
    resourceId: id,
    requestId,
    metadata: { de: m.conversation_id, para: resultados.map((r) => r.conversation_id), ok: resultados.filter((r) => r.ok).length },
  });
  return ok({ resultados }, { requestId });
}
