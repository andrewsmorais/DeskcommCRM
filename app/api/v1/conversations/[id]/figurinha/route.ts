import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/figurinha { figurinha_id } — manda uma
 * figurinha da biblioteca nesta conversa.
 *
 * A conversa é lida com o client da SESSÃO (quem não a enxerga não manda). O
 * arquivo é copiado para a pasta da conversa no Storage (o envio só aceita
 * arquivo da própria conversa) e sai pelo mesmo caminho da tela
 * (`sendMessageHandler`, tipo `sticker`). Só pelo WhatsApp conectado por QR
 * code: é o único canal que tem envio de figurinha.
 */
import { randomUUID } from "node:crypto";

import { DEFAULT_CHANNEL_PROVIDER } from "@/lib/channels";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { MIME } from "@/lib/figurinhas/figurinha";
import { traduzir } from "@/lib/i18n/dicionario";
import type { SendMessageInput } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const { id } = await ctx.params;
  const pedido = z.object({ figurinha_id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !pedido.success)
    return fail("validation_failed", t("Escolha a figurinha."), 422, { requestId });
  const orgId = authz.org.orgId;

  const supabase = await createClient();
  const { data: conversa } = await supabase
    .from("conversations")
    .select("id, channel_sessions:channel_session_id(provider)")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const provedor =
    (conversa as { channel_sessions?: { provider?: string | null } | null }).channel_sessions?.provider ?? DEFAULT_CHANNEL_PROVIDER;
  if (provedor !== DEFAULT_CHANNEL_PROVIDER)
    return fail(
      "validation_failed",
      t("Figurinha só sai pelo WhatsApp conectado por QR code."),
      422,
      { requestId },
    );

  const admin = createAdminClient();
  const { data: figurinha } = await admin
    .from("figurinhas")
    .select("storage_path")
    .eq("id", pedido.data.figurinha_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!figurinha) return fail("not_found", t("Figurinha não encontrada."), 404, { requestId });
  const destino = `${orgId}/${id}/${randomUUID()}-figurinha.webp`;
  const { error: erroDaCopia } = await admin.storage
    .from("whatsapp-media")
    .copy((figurinha as { storage_path: string }).storage_path, destino);
  if (erroDaCopia) return fail("internal_error", erroDaCopia.message.slice(0, 200), 500, { requestId });

  const enviada = await sendMessageHandler(
    supabase,
    {
      organization_id: orgId,
      actor: { type: "user", id: authz.user.id, role: authz.org.role },
      requestId,
      idioma: authz.user.idioma,
    },
    {
      conversation_id: id,
      type: "sticker",
      media_storage_path: destino,
      media_mime: MIME,
      metadata: { figurinha_id: pedido.data.figurinha_id },
    } as SendMessageInput,
  );
  return ok(enviada, { requestId, status: 201 });
}
