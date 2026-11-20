/**
 * Chat no site — listar e criar (administrador).
 *
 * `GET  /api/v1/channels/webchat` → os chats da organização, com o código de
 *        uma linha para colar no site.
 * `POST /api/v1/channels/webchat` → cria um chat já ligado. A IA nasce FECHADA
 *        (mesmo padrão dos outros canais): o dono libera na própria tela.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { CHANNEL_PROVIDER_WEBCHAT } from "@/lib/channels/capabilities";
import { configDoChatSchema, novaChaveDoChat } from "@/lib/channels/webchat/config";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { COLUNAS_DO_CHAT, entradaDoChatSchema, paraATela, type LinhaDoChat } from "./_comum";

export const dynamic = "force-dynamic";

/** Teto por organização: é um balão por site, não uma lista sem fim. */
const MAX_POR_ORGANIZACAO = 10;

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "webchat" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient()
    .from("channel_sessions")
    .select(COLUNAS_DO_CHAT)
    .eq("organization_id", authz.org.orgId)
    .eq("provider", CHANNEL_PROVIDER_WEBCHAT)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok({ chats: ((data ?? []) as unknown as LinhaDoChat[]).map(paraATela) }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "webchat" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const pedido = entradaDoChatSchema.safeParse(await req.json().catch(() => null));
  if (!pedido.success)
    return fail("validation_failed", t("Confira os campos do chat."), 422, { requestId });

  const admin = createAdminClient();
  const { count } = await admin
    .from("channel_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", authz.org.orgId)
    .eq("provider", CHANNEL_PROVIDER_WEBCHAT)
    .is("archived_at", null);
  if ((count ?? 0) >= MAX_POR_ORGANIZACAO)
    return fail("limit_reached", t("Limite de chats de site atingido."), 422, { requestId });

  // A coluna do segredo de webhook é obrigatória na tabela; este canal não
  // recebe webhook de ninguém, então vai um valor aleatório que nada usa.
  const segredo = await encryptWebhookSecret(admin, randomBytes(32).toString("hex"));
  if (!segredo) return fail("internal_error", t("Cifra indisponível."), 500, { requestId });

  const { nome, ...aparencia } = pedido.data;
  // A chave pública é também o token de caminho da linha: é por ele (único na
  // tabela inteira) que a rota pública acha o canal e a organização.
  const chave = novaChaveDoChat();
  const { data, error } = await admin
    .from("channel_sessions")
    .insert({
      organization_id: authz.org.orgId,
      provider: CHANNEL_PROVIDER_WEBCHAT,
      webchat_key: chave,
      webhook_path_token: chave,
      webhook_secret_encrypted: segredo,
      display_name: nome,
      status: "WORKING",
      created_by: authz.user.id,
      metadata: { ...metadataInicialDoCanal(), webchat: configDoChatSchema.parse(aparencia) },
    })
    .select(COLUNAS_DO_CHAT)
    .single();
  if (error || !data)
    return fail("internal_error", error?.message ?? "insert_failed", 500, { requestId });

  const linha = data as unknown as LinhaDoChat;
  void audit({
    action: "channel.webchat_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "channel_session",
    resourceId: linha.id,
    requestId,
    metadata: { nome },
  });
  return ok(paraATela(linha), { requestId, status: 201 });
}
