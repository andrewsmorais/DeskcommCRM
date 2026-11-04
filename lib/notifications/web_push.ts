import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { vapidPronto, vapidPublica, vapidSubject } from "./vapid";
import type { PushPayload } from "./push_payload";

export type PushSubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type Admin = SupabaseClient;
type Resultado = { sent: number; gone: number };
const NADA: Resultado = { sent: 0, gone: 0 };

/**
 * Prazo de cada envio, em ms. O endpoint é escolhido por quem se inscreve
 * (qualquer membro), e o web-push só arma timeout de socket quando recebe um:
 * sem ele, um endpoint que manda os cabeçalhos e para deixa a promessa
 * pendente para sempre — e o envio roda dentro do dreno do event_log, que
 * atende todas as organizações em fila. O prazo do handler no dispatcher
 * segura o resto (endpoint que pinga um byte por vez).
 */
export const PUSH_TIMEOUT_MS = 10_000;

/**
 * O mesmo par de guarda de egress dos webhooks: o textual (esquema, http em
 * produção, literal privado) e o que resolve o DNS e julga o IP. Na inscrição
 * (rota PUT) e de novo aqui, porque a linha também entra direto pela RLS.
 */
export async function endpointDePushSeguro(endpoint: string): Promise<boolean> {
  try {
    assertSafeOutboundUrl(endpoint);
    await assertDestinoResolvidoSeguro(new URL(endpoint).hostname);
    return true;
  } catch {
    return false;
  }
}

/** Membro ATIVO da organização: vínculo em `user_organizations` sem `revoked_at`. */
export type MembroAtivo = { user_id: string; role: string };
export type ConversaVisivel = { assigned_to_user_id: string | null; is_private: boolean | null };

/**
 * Quem pode ver a conversa — espelho de `fn_can_view_conversation`, as duas
 * assinaturas, na ÚLTIMA definição do baseline (é a que o banco instala):
 *   - leitor, gerente e admin veem; atendente vê a sua, e a dos outros só pelo
 *     `visibility_mode` da organização (`all`; `own_and_unassigned`, o padrão,
 *     só as sem responsável);
 *   - conversa privada (1:1 ou grupo), além disso, só o responsável, gerente e
 *     admin.
 * O aviso leva nome do contato e trecho da mensagem: mandá-lo a quem a
 * Inbox esconde a conversa entrega o que a RLS segura.
 */
export function podeVerConversa(
  membro: MembroAtivo,
  conversa: ConversaVisivel,
  visibilityMode: string | null,
): boolean {
  const responsavel = conversa.assigned_to_user_id === membro.user_id;
  let ve: boolean;
  if (["viewer", "manager", "admin"].includes(membro.role) || responsavel) ve = true;
  else {
    const modo = visibilityMode ?? "own_and_unassigned";
    ve = modo === "all" || (modo === "own_and_unassigned" && conversa.assigned_to_user_id === null);
  }
  return ve && (!conversa.is_private || responsavel || ["manager", "admin"].includes(membro.role));
}

async function membrosAtivos(
  admin: Admin,
  organizationId: string,
  userId?: string,
): Promise<MembroAtivo[] | null> {
  let q = admin
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .is("revoked_at", null);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) {
    logger.warn("push_membros_list_failed", { detail: error.message });
    return null;
  }
  return (data ?? []) as MembroAtivo[];
}

/** Envia só às inscrições DESTES usuários nesta organização. */
async function enviarAosUsuarios(
  admin: Admin,
  organizationId: string,
  userIds: string[],
  payload: PushPayload,
): Promise<Resultado> {
  if (userIds.length === 0) return NADA;
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("organization_id", organizationId)
    .in("user_id", [...new Set(userIds)]);
  if (error) {
    logger.warn("push_subscriptions_list_failed", { detail: error.message });
    return NADA;
  }
  const rows = (data ?? []) as PushSubRow[];
  if (rows.length === 0) return NADA;

  webpush.setVapidDetails(await vapidSubject(), vapidPublica()!, env.VAPID_PRIVATE_KEY.trim());

  let sent = 0;
  let gone = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      if (!(await endpointDePushSeguro(row.endpoint))) {
        logger.warn("web_push_endpoint_recusado", { subscription_id: row.id });
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { timeout: PUSH_TIMEOUT_MS },
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          gone += 1;
          await admin
            .from("push_subscriptions")
            .delete()
            .eq("organization_id", organizationId)
            .eq("id", row.id);
          return;
        }
        logger.warn("web_push_send_failed", { status: status ?? 0 });
      }
    }),
  );

  return { sent, gone };
}

/**
 * Aviso que não é de uma conversa (ex.: aviso da Central sem conversa): vai a
 * todo membro ATIVO. A inscrição de quem foi revogado fica de fora mesmo que a
 * linha ainda exista.
 */
export async function enviarPushDaOrg(
  organizationId: string,
  payload: PushPayload,
  admin: Admin = createAdminClient(),
): Promise<Resultado> {
  if (!vapidPronto()) return NADA;
  const membros = await membrosAtivos(admin, organizationId);
  if (!membros) return NADA;
  return enviarAosUsuarios(
    admin,
    organizationId,
    membros.map((m) => m.user_id),
    payload,
  );
}

/** Aviso de uma conversa: só a quem pode vê-la (`podeVerConversa`). */
export async function enviarPushDaConversa(
  organizationId: string,
  conversationId: string,
  payload: PushPayload,
  admin: Admin = createAdminClient(),
): Promise<Resultado> {
  if (!vapidPronto()) return NADA;
  const { data: conversa } = await admin
    .from("conversations")
    .select("assigned_to_user_id, is_private")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversa) return NADA;
  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  const modo = (org as { settings?: { visibility_mode?: unknown } | null } | null)?.settings
    ?.visibility_mode;
  const membros = await membrosAtivos(admin, organizationId);
  if (!membros) return NADA;
  const quemVe = membros.filter((m) =>
    podeVerConversa(m, conversa as ConversaVisivel, typeof modo === "string" ? modo : null),
  );
  return enviarAosUsuarios(
    admin,
    organizationId,
    quemVe.map((m) => m.user_id),
    payload,
  );
}

/** Aviso dirigido a uma pessoa — só se ela ainda for membro ativo. */
export async function enviarPushAoUsuario(
  organizationId: string,
  userId: string,
  payload: PushPayload,
  admin: Admin = createAdminClient(),
): Promise<Resultado> {
  if (!vapidPronto()) return NADA;
  const membro = await membrosAtivos(admin, organizationId, userId);
  if (!membro?.length) return NADA;
  return enviarAosUsuarios(admin, organizationId, [userId], payload);
}

/**
 * Apaga as inscrições de um membro nesta organização — chamada ao revogá-lo.
 * Depois de revogado ele não alcança mais a linha pela RLS, e o aviso que a
 * inscrição recebe aparece na tela de bloqueio do aparelho dele.
 */
export async function removerPushDoMembro(
  organizationId: string,
  userId: string,
  admin: Admin = createAdminClient(),
): Promise<void> {
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (error) logger.warn("push_subscriptions_revoke_cleanup_failed", { detail: error.message });
}
