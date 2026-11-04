import { supportCallbackWriteAllowed } from "@/lib/impersonate/support";
/**
 * GET /api/v1/integrations/nuvemshop/callback
 *
 * OAuth callback. Validates state, exchanges code for token, encrypts it,
 * upserts tenant_integrations, and registers the 8 mandatory webhooks.
 *
 * Failure modes redirect back to the UI with `?error=<code>`. The action is
 * audited either way.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { integracaoDaLoja } from "@/lib/nuvemshop/integracao-da-loja";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfig, SUBSCRIBED_EVENTS, eventToSlug } from "@/lib/nuvemshop/config";
import { exchangeCodeForToken } from "@/lib/nuvemshop/oauth";
import { NuvemshopApiClient } from "@/lib/nuvemshop/api-client";
import { verifyState } from "@/lib/nuvemshop/state";

export const dynamic = "force-dynamic";

function redirectTo(path: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(path, base));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  const cfg = getConfig();
  if (!cfg) {
    return redirectTo(`/app/integrations/nuvemshop?error=not_configured`);
  }

  const state = verifyState(stateParam);
  if (!state) {
    await audit({
      action: "nuvemshop.oauth_failed",
      metadata: { reason: "invalid_state" },
    });
    return redirectTo(`/app/integrations/nuvemshop?error=invalid_state`);
  }

  if (!code) {
    await audit({
      action: "nuvemshop.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "missing_code" },
    });
    return redirectTo(`/app/integrations/nuvemshop?error=missing_code`);
  }

  if (!(await supportCallbackWriteAllowed(state.orgId, state.userId, state.authSessionId)))
    return redirectTo("/app/integrations/nuvemshop?error=invalid_state");

  // Exchange code for access token.
  const tokenRes = await exchangeCodeForToken(code, cfg);
  if (!tokenRes.ok) {
    await audit({
      action: "nuvemshop.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: tokenRes.error, status: tokenRes.status ?? null },
    });
    return redirectTo(`/app/integrations/nuvemshop?error=${tokenRes.error}`);
  }

  const { accessToken, scope, storeId } = tokenRes;
  const admin = createAdminClient();

  // Encrypt access token + webhook secret (we keep the client_secret in env, but
  // tenant_integrations.webhook_secret_encrypted is NOT NULL — we store the
  // app's client_secret encrypted so the webhook handler can read it via the
  // same per-row decrypt path used by other providers). This also keeps the
  // door open for per-tenant rotation later.
  const encrypted = await admin.rpc("fn_encrypt_oauth", { plaintext: accessToken });
  if (encrypted.error || !encrypted.data) {
    await audit({
      action: "nuvemshop.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "encrypt_failed", error: encrypted.error?.message ?? "no_data" },
    });
    return redirectTo(`/app/integrations/nuvemshop?error=encrypt_failed`);
  }
  // ⚠️ O `client_secret` do app NÃO vai mais para a linha do tenant: ele é da
  // instalação, os webhooks conferem contra o `.env`, e a cópia na linha era
  // legível por membros e virava segredo em claro por outra porta (ver
  // `lib/nuvemshop/integracao-da-loja.ts`). A coluna é NOT NULL e recebe um
  // valor aleatório que nada confere.
  const webhookSecretEnc = await admin.rpc("fn_encrypt_oauth", {
    plaintext: randomBytes(32).toString("hex"),
  });
  if (webhookSecretEnc.error || !webhookSecretEnc.data) {
    await audit({
      action: "nuvemshop.oauth_failed",
      organizationId: state.orgId,
      metadata: {
        reason: "encrypt_failed",
        error: webhookSecretEnc.error?.message ?? "no_data",
      },
    });
    return redirectTo(`/app/integrations/nuvemshop?error=encrypt_failed`);
  }

  // Uma loja, uma organização. O `store_id` decide de quem é cada webhook, e
  // a mesma loja em duas organizações deixava as duas sem webhook nenhum.
  const dona = await integracaoDaLoja(admin, storeId);
  if (
    dona.tipo === "erro" ||
    dona.tipo === "ambigua" ||
    (dona.tipo === "achada" && dona.integracao.organization_id !== state.orgId)
  ) {
    await audit({
      action: "nuvemshop.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "store_already_linked", store_id: storeId },
    });
    return redirectTo(`/app/integrations/nuvemshop?error=store_already_linked`);
  }

  const webhookPathToken = randomBytes(24).toString("hex");
  const scopes = scope ? scope.split(/[\s,]+/).filter(Boolean) : [];

  // Upsert tenant_integrations row.
  const { data: integration, error: upsertErr } = await admin
    .from("tenant_integrations")
    .upsert(
      {
        organization_id: state.orgId,
        provider: "nuvemshop",
        oauth_access_token_encrypted: encrypted.data,
        scopes,
        status: "healthy",
        store_metadata: { store_id: storeId },
        webhook_path_token: webhookPathToken,
        webhook_secret_encrypted: webhookSecretEnc.data,
        webhook_subscriptions: {},
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    )
    .select("id")
    .single();

  if (upsertErr) {
    await audit({
      action: "nuvemshop.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "db_upsert_failed", error: upsertErr.message },
    });
    return redirectTo(`/app/integrations/nuvemshop?error=db_upsert_failed`);
  }

  // Register the 8 webhooks. Best-effort: log failures but don't roll back.
  const subscriptions: Record<string, { id: number | null; error?: string }> = {};
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const client = new NuvemshopApiClient({ storeId, accessToken });
  for (const event of SUBSCRIBED_EVENTS) {
    const target = `${baseUrl}/api/v1/webhooks/nuvemshop/${eventToSlug(event)}`;
    try {
      const wh = await client.createWebhook(event, target);
      subscriptions[event] = { id: wh.id ?? null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      subscriptions[event] = { id: null, error: msg };
    }
  }

  await admin
    .from("tenant_integrations")
    .update({ webhook_subscriptions: subscriptions })
    .eq("organization_id", state.orgId)
    .eq("provider", "nuvemshop");

  await audit({
    actorUserId: state.userId,
    actorAuthSessionId: state.authSessionId,
    action: "nuvemshop.connected",
    organizationId: state.orgId,
    resourceType: "tenant_integration",
    resourceId: integration?.id,
    requestId: randomUUID(),
    metadata: {
      store_id: storeId,
      scopes,
      webhooks_registered: Object.entries(subscriptions)
        .filter(([, v]) => v.id !== null)
        .map(([k]) => k),
      webhooks_failed: Object.entries(subscriptions)
        .filter(([, v]) => v.id === null)
        .map(([k]) => k),
    },
  });

  return redirectTo(`/app/integrations/nuvemshop?ok=1`);
}
