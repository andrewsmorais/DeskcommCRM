/**
 * POST /api/v1/chatbot-flows/[id]/media — sobe o arquivo do passo "Enviar mídia" (multipart).
 * GET  /api/v1/chatbot-flows/[id]/media?path=… — link curto para a tela mostrar o arquivo.
 *
 * Por que uma rota própria: a de mídia do inbox exige uma CONVERSA (o caminho é
 * `org/conversa/…`). O arquivo do chatbot não é de conversa nenhuma — ele mora
 * em `whatsapp-media/<org>/chatbot/<fluxo>/…` e é COPIADO para a conversa na
 * hora do envio (`lib/chatbot/midia.ts`).
 *
 * Teto de 16 MB, abaixo dos 50 MB do inbox: o mesmo arquivo vai para MUITAS
 * conversas, cada envio é uma cópia, e o Storage de quem instala numa VPS é uma
 * cota só, dividida com toda a mídia das conversas. 16 MB é também o teto do
 * WhatsApp para vídeo e áudio.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { caminhoDoChatbotDaOrg, BUCKET_DA_MIDIA } from "@/lib/chatbot/midia";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { extFromMime } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { transcodificarNotaDeVoz } from "@/lib/messaging/media/voice-transcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TETO_BYTES = 16 * 1024 * 1024;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

/** O fluxo é da organização ativa? (RLS + filtro explícito) */
async function fluxoDaOrg(id: string, orgId: string): Promise<boolean> {
  const db = await createClient();
  const { data } = await db
    .from("chatbot_flows")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "chatbot_flow_media" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", t("id inválido."), 400, { requestId });
  if (!(await fluxoDaOrg(id, auth.org.orgId)))
    return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  // Recusa pelo tamanho DECLARADO antes de ler o corpo inteiro (1 MB de folga
  // para o envelope do multipart); o tamanho real é conferido depois.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TETO_BYTES + 1_048_576)
    return fail("payload_too_large", t("O arquivo precisa ter até 16 MB."), 413, { requestId });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });
  if (file.size > TETO_BYTES)
    return fail("payload_too_large", t("O arquivo precisa ter até 16 MB."), 413, { requestId });

  const mime = file.type || "application/octet-stream";
  const veredito = validateOutboundMedia(mime, file.size);
  if (!veredito.ok) {
    const status =
      veredito.code === "payload_too_large" ? 413 : veredito.code === "unsupported_media_type" ? 415 : 422;
    return fail(veredito.code, t(veredito.message), status, { requestId });
  }

  // Nota de voz gravada no navegador sai em webm, que o canal recusa depois de
  // aceitar: converte aqui, como a rota de mídia do inbox.
  const audio = await transcodificarNotaDeVoz({ buffer: Buffer.from(await file.arrayBuffer()), mime });
  const caminho = `${auth.org.orgId}/chatbot/${id}/${randomUUID()}.${extFromMime(audio.mime)}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET_DA_MIDIA)
    .upload(caminho, audio.buffer, { contentType: audio.mime, upsert: false });
  if (error) {
    logger.error("[chatbot-flows.media] upload falhou", { detail: error.message, requestId });
    return fail("internal_error", t("Erro ao subir o arquivo."), 500, { requestId });
  }

  void audit({
    action: "chatbot_flow.media_uploaded",
    organizationId: auth.org.orgId,
    actorUserId: auth.user.id,
    resourceType: "chatbot_flow",
    resourceId: id,
    requestId,
    metadata: { tipo: veredito.kind, bytes: audio.buffer.length },
  });

  return ok(
    {
      storage_path: caminho,
      mime: audio.mime,
      tipo: veredito.kind,
      nome_arquivo: file.name.slice(0, 200),
      bytes: audio.buffer.length,
    },
    { requestId },
  );
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "chatbot_flow_media" });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const caminho = req.nextUrl.searchParams.get("path") ?? "";
  // Da organização basta (não precisa ser deste fluxo): um fluxo duplicado
  // aponta para o arquivo do original, e a tela tem de conseguir mostrá-lo.
  if (!UUID_RX.test(id) || !caminhoDoChatbotDaOrg(caminho, auth.org.orgId))
    return fail("invalid_request", "Arquivo inválido.", 400, { requestId });
  if (!(await fluxoDaOrg(id, auth.org.orgId)))
    return fail("not_found", "Fluxo não encontrado.", 404, { requestId });

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET_DA_MIDIA)
    .createSignedUrl(caminho, 600);
  if (error || !data?.signedUrl)
    return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  return ok({ url: data.signedUrl }, { requestId });
}
