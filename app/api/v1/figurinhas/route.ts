import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * /api/v1/figurinhas — a biblioteca de figurinhas da empresa (migration 0516).
 *
 * GET (atendente ou acima): as figurinhas com um link assinado de 1 hora para a
 *   tela mostrar (o bucket é privado).
 * POST (atendente ou acima): guarda uma figurinha. Dois jeitos:
 *   - multipart com `file` (PNG, JPG, WebP ou GIF do computador);
 *   - JSON `{ message_id }`: a figurinha (ou imagem) que chegou numa conversa.
 *   Nos dois, o arquivo é convertido para o formato do WhatsApp
 *   (`lib/figurinhas/figurinha.ts`). A mesma figurinha não entra duas vezes.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { caminhoDeMidiaDaEmpresa } from "@/lib/messaging/media/upload-validation";
import {
  caminhoDaFigurinha,
  FigurinhaInvalida,
  hashDaFigurinha,
  MAX_ENTRADA,
  MAX_POR_EMPRESA,
  MIME,
  paraFigurinha,
} from "@/lib/figurinhas/figurinha";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "whatsapp-media";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("figurinhas")
    .select("id, storage_path, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(MAX_POR_EMPRESA);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const linhas = (data ?? []) as Array<{ id: string; storage_path: string; created_at: string }>;
  const links: Record<string, string> = {};
  if (linhas.length > 0) {
    const { data: assinados } = await createAdminClient()
      .storage.from(BUCKET)
      .createSignedUrls(linhas.map((l) => l.storage_path), 3600);
    for (const a of assinados ?? []) if (a.path && a.signedUrl) links[a.path] = a.signedUrl;
  }
  return ok(
    linhas.map((l) => ({ id: l.id, url: links[l.storage_path] ?? null, created_at: l.created_at })),
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const orgId = authz.org.orgId;
  const admin = createAdminClient();

  const { count } = await admin
    .from("figurinhas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if ((count ?? 0) >= MAX_POR_EMPRESA)
    return fail("validation_failed", t("A biblioteca já tem 200 figurinhas. Apague alguma antes."), 422, { requestId });

  let entrada: Buffer;
  let origem: "computador" | "conversa";
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const arquivo = form?.get("file");
    if (!(arquivo instanceof File)) return fail("validation_failed", t("Escolha uma imagem."), 422, { requestId });
    if (arquivo.size > MAX_ENTRADA) return fail("validation_failed", t("Imagem maior que 5 MB."), 413, { requestId });
    entrada = Buffer.from(await arquivo.arrayBuffer());
    origem = "computador";
  } else {
    const pedido = z.object({ message_id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
    if (!pedido.success) return fail("validation_failed", t("Escolha a figurinha."), 422, { requestId });
    // A mensagem é lida com o client da SESSÃO: quem não enxerga a conversa não
    // guarda a figurinha dela.
    const supabase = await createClient();
    const { data: msg } = await supabase
      .from("messages")
      .select("type, media_storage_path, media_size_bytes, revoked_at")
      .eq("id", pedido.data.message_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    const m = msg as {
      type: string;
      media_storage_path: string | null;
      media_size_bytes: number | null;
      revoked_at: string | null;
    } | null;
    if (!m || m.revoked_at || !["sticker", "image"].includes(m.type) || !caminhoDeMidiaDaEmpresa(m.media_storage_path, orgId))
      return fail("not_found", t("Figurinha não encontrada."), 404, { requestId });
    // O tamanho gravado barra antes de baixar: sem isto, um vídeo de 50 MB
    // rotulado como imagem ia inteiro para a memória só para ser recusado.
    if ((m.media_size_bytes ?? 0) > MAX_ENTRADA)
      return fail("validation_failed", t("A imagem é grande demais para virar figurinha."), 422, { requestId });
    const { data: blob, error } = await admin.storage.from(BUCKET).download(m.media_storage_path);
    if (error || !blob) return fail("not_found", t("O arquivo da figurinha não está mais guardado."), 404, { requestId });
    entrada = Buffer.from(await blob.arrayBuffer());
    origem = "conversa";
  }

  let figurinha: Buffer;
  try {
    figurinha = await paraFigurinha(entrada);
  } catch (err) {
    if (err instanceof FigurinhaInvalida) return fail("validation_failed", t(err.message), 422, { requestId });
    throw err;
  }
  const hash = hashDaFigurinha(figurinha);
  const caminho = caminhoDaFigurinha(orgId, hash);
  const { error: erroDoEnvio } = await admin.storage
    .from(BUCKET)
    .upload(caminho, figurinha, { contentType: MIME, upsert: true });
  if (erroDoEnvio) return fail("internal_error", erroDoEnvio.message, 500, { requestId });

  const { data: existente } = await admin
    .from("figurinhas")
    .select("id")
    .eq("organization_id", orgId)
    .eq("hash", hash)
    .maybeSingle();
  if (existente) return ok({ id: (existente as { id: string }).id, ja_existia: true }, { requestId });

  const { data: criada, error } = await admin
    .from("figurinhas")
    .insert({ organization_id: orgId, storage_path: caminho, hash, criado_por: authz.user.id })
    .select("id")
    .single();
  if (error || !criada) return fail("internal_error", error?.message ?? "insert", 500, { requestId });

  void audit({
    action: "sticker.saved",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "sticker",
    resourceId: (criada as { id: string }).id,
    requestId,
    metadata: { origem },
  });
  return ok({ id: (criada as { id: string }).id, ja_existia: false }, { requestId, status: 201 });
}
