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

type AdminLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => Promise<{ data: PushSubRow[] | null; error: { message: string } | null }>;
    };
    delete: () => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function store(admin: AdminLike) {
  return admin.from("push_subscriptions");
}

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

export async function enviarPushDaOrg(
  organizationId: string,
  payload: PushPayload,
  admin: AdminLike = createAdminClient() as unknown as AdminLike,
): Promise<{ sent: number; gone: number }> {
  if (!vapidPronto()) return { sent: 0, gone: 0 };

  const { data, error } = await store(admin)
    .select("id, endpoint, p256dh, auth")
    .eq("organization_id", organizationId);
  if (error) {
    logger.warn("push_subscriptions_list_failed", { detail: error.message });
    return { sent: 0, gone: 0 };
  }
  const rows = data ?? [];
  if (rows.length === 0) return { sent: 0, gone: 0 };

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
          await store(admin).delete().eq("id", row.id);
          return;
        }
        logger.warn("web_push_send_failed", { status: status ?? 0 });
      }
    }),
  );

  return { sent, gone };
}

export async function enviarPushAoUsuario(
  organizationId: string,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; gone: number }> {
  if (!vapidPronto()) return { sent: 0, gone: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (error) {
    logger.warn("push_subscriptions_user_list_failed", { detail: error.message });
    return { sent: 0, gone: 0 };
  }
  return enviarPushDaOrg(organizationId, payload, {
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ data: (data ?? []) as PushSubRow[], error: null }),
      }),
      delete: () => ({
        eq: async (col: string, val: string) => {
          const { error: delErr } = await admin.from(table).delete().eq(col, val);
          return { error: delErr };
        },
      }),
    }),
  });
}
