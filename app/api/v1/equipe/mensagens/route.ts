import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * /api/v1/equipe/mensagens — as mensagens de UMA conversa do chat interno.
 *
 * GET ?com=geral|<id da pessoa>[&antes=<ISO>] — as 50 mais recentes (ou
 *   anteriores a `antes`), da mais velha para a mais nova. Lidas com o cliente
 *   do usuário: a RLS só entrega a Geral e as diretas DELE.
 * POST { com, corpo } — envia. Escreve com a service role, depois de conferir
 *   que o destinatário é membro ativo DESTA organização (o id vem do corpo).
 *   Marca a conversa como lida para quem enviou e avisa no celular o
 *   destinatário da conversa direta. A auditoria nunca guarda o texto.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { chaveDaConversaSchema, novaMensagemSchema, PAGINA, SALA_GERAL } from "@/lib/equipe/chat";
import { traduzir } from "@/lib/i18n/dicionario";
import { enviarPushAoUsuario } from "@/lib/notifications/web_push";
import { validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { membrosDaEquipe } from "../_membros";

export const dynamic = "force-dynamic";

const COLUNAS = "id, autor_user_id, destinatario_user_id, corpo, created_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const eu = authz.user.id;
  const t = (s: string) => traduzir(s, authz.user.idioma);

  const url = new URL(req.url);
  const com = chaveDaConversaSchema.safeParse(url.searchParams.get("com"));
  if (!com.success) return fail("validation_failed", t("Conversa inválida."), 422, { requestId });
  const antes = url.searchParams.get("antes");
  if (antes && Number.isNaN(Date.parse(antes)))
    return fail("validation_failed", t("Data inválida."), 422, { requestId });

  const supabase = await createClient();
  let q = supabase.from("equipe_mensagens").select(COLUNAS).eq("organization_id", authz.org.orgId);
  q =
    com.data === SALA_GERAL
      ? q.is("destinatario_user_id", null)
      : q.or(
          `and(autor_user_id.eq.${eu},destinatario_user_id.eq.${com.data}),and(autor_user_id.eq.${com.data},destinatario_user_id.eq.${eu})`,
        );
  if (antes) q = q.lt("created_at", new Date(antes).toISOString());
  const { data, error } = await q.order("created_at", { ascending: false }).limit(PAGINA);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const lista = [...(data ?? [])].reverse();
  return ok({ mensagens: lista, tem_mais: (data ?? []).length === PAGINA }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const eu = authz.user.id;
  const orgId = authz.org.orgId;
  const t = (s: string) => traduzir(s, authz.user.idioma);

  let input;
  try {
    input = await validateRequest(novaMensagemSchema, req);
  } catch (err) {
    if (err instanceof ApiError)
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    throw err;
  }

  const direta = input.com !== SALA_GERAL;
  let nomeDoAutor = "";
  if (direta) {
    if (input.com === eu)
      return fail("validation_failed", t("Escolha outra pessoa da equipe."), 422, { requestId });
    const membros = await membrosDaEquipe(orgId);
    if (!membros.some((m) => m.user_id === input.com))
      return fail("not_found", t("Essa pessoa não está na equipe."), 404, { requestId });
    nomeDoAutor = membros.find((m) => m.user_id === eu)?.nome ?? "";
  }

  const admin = createAdminClient();
  const { data: criada, error } = await admin
    .from("equipe_mensagens")
    .insert({
      organization_id: orgId,
      autor_user_id: eu,
      destinatario_user_id: direta ? input.com : null,
      corpo: input.corpo,
    })
    .select(COLUNAS)
    .single();
  if (error || !criada) return fail("internal_error", error?.message ?? "insert", 500, { requestId });

  // Quem escreveu leu tudo até aqui.
  await admin
    .from("equipe_leituras")
    .upsert(
      { organization_id: orgId, user_id: eu, conversa: input.com, lida_ate: (criada as { created_at: string }).created_at },
      { onConflict: "organization_id,user_id,conversa" },
    );

  if (direta)
    void enviarPushAoUsuario(orgId, input.com, {
      title: `${nomeDoAutor || t("Alguém da equipe")} ${t("te mandou uma mensagem")}`.slice(0, 140),
      body: t("Abra o chat da equipe para ler."),
      tag: `equipe:${eu}`,
      href: `/app/equipe/chat?com=${eu}`,
    }).catch(() => undefined);

  void audit({
    action: "team_chat.message_sent",
    actorUserId: eu,
    organizationId: orgId,
    resourceType: "team_chat_message",
    resourceId: (criada as { id: string }).id,
    requestId,
    metadata: { conversa: direta ? "direta" : "geral" },
  });

  return ok(criada, { requestId, status: 201 });
}
