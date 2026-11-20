/**
 * POST /api/v1/webhooks/nuvemshop/[event]
 *
 * Catch-all receiver for the 8 mandatory Nuvemshop webhooks. Behavior:
 *  1. Read raw body (for HMAC verification — must NOT be re-stringified).
 *  2. Parse JSON, look up tenant_integrations by store_id (in store_metadata).
 *  3. Verify HMAC SHA256 using the installation's app client_secret, read
 *     from the environment (never from a tenant row — see
 *     `lib/nuvemshop/integracao-da-loja.ts`).
 *  4. Insert webhook_events_log; rely on the partial unique constraint to
 *     deduplicate (provider, organization_id, external_id) for idempotency.
 *  5. Emit a row in event_log via the `emit_event` SQL function. Workers
 *     consume from there — no heavy processing inside the request lifecycle.
 *  6. Always 200 quickly (Nuvemshop disables webhooks after 5 consecutive 5xx).
 */

import type { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { integracaoDaLoja, segredoDoApp } from "@/lib/nuvemshop/integracao-da-loja";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugToEvent } from "@/lib/nuvemshop/config";
import { verifyHmac } from "@/lib/nuvemshop/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ event: string }>;
}

interface NuvemshopPayload {
  store_id?: number | string;
  event?: string;
  id?: number | string;
  // Per-event extras (order id, product id, etc) — opaque here.
}

function externalIdFor(event: string, body: NuvemshopPayload): string {
  const storeId = body.store_id !== undefined ? String(body.store_id) : "unknown";
  const id = body.id !== undefined ? String(body.id) : "noid";
  return `${event}:${storeId}:${id}`;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const { event: slug } = await ctx.params;
  const event = slugToEvent(slug);
  if (!event) {
    return fail("not_found", `unknown nuvemshop event slug: ${slug}`, 404);
  }

  const rawBody = await req.text();
  let body: NuvemshopPayload;
  try {
    body = JSON.parse(rawBody) as NuvemshopPayload;
  } catch {
    return fail("invalid_request", "invalid_json", 400);
  }

  const storeId = body.store_id !== undefined ? String(body.store_id) : "";
  if (!storeId) {
    return fail("invalid_request", "missing store_id", 400);
  }

  const admin = createAdminClient();

  // Organização pela loja; segredo do APP pelo ambiente (ver
  // `lib/nuvemshop/integracao-da-loja.ts` — os dois porquês estão lá).
  const busca = await integracaoDaLoja(admin, storeId);
  if (busca.tipo === "ambigua" || busca.tipo === "erro") {
    logger.error("[nuvemshop] loja sem dono único", {
      store_id: storeId,
      motivo: busca.tipo,
      event,
    });
    return fail("internal_error", "ambiguous_store_binding", 500);
  }
  if (busca.tipo === "nenhuma") {
    // No tenant matches — could be a stale subscription or test ping. We
    // intentionally return 200 so Nuvemshop stops retrying, but log silently.
    return ok({ accepted: false, reason: "tenant_not_found" });
  }
  const integration = busca.integracao;
  const clientSecret = segredoDoApp();
  if (!clientSecret) return ok({ accepted: false, reason: "integration_not_configured" });

  const sigHeader =
    req.headers.get("x-linkedstore-hmac-sha256") ?? req.headers.get("X-Linkedstore-Hmac-Sha256");
  const valid = verifyHmac(rawBody, sigHeader, clientSecret);
  if (!valid) {
    await audit({
      action: "nuvemshop.webhook_invalid_signature",
      organizationId: integration.organization_id,
      metadata: { event, store_id: storeId },
    });
    return fail("unauthenticated", "invalid_signature", 401);
  }

  const externalId = externalIdFor(event, body);

  // Idempotent log insert. webhook_events_log doesn't have a unique constraint
  // on (provider, external_id) yet, so we manually check for an existing row.
  const { data: existing } = await admin
    .from("webhook_events_log")
    .select("id")
    .eq("provider", "nuvemshop")
    .eq("organization_id", integration.organization_id)
    .eq("external_id", externalId)
    .maybeSingle();

  if (existing) {
    return ok({ accepted: true, idempotent: true });
  }

  const headersJson: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    // Strip auth-sensitive headers from the log.
    if (key.toLowerCase().startsWith("authorization")) return;
    if (key.toLowerCase() === "cookie") return;
    headersJson[key] = value;
  });

  const { error: insertErr } = await admin.from("webhook_events_log").insert({
    organization_id: integration.organization_id,
    provider: "nuvemshop",
    http_method: "POST",
    headers: headersJson,
    raw_body: rawBody,
    payload_parsed: body,
    signature_header: sigHeader ?? null,
    valid_signature: true,
    event_type: event,
    external_id: externalId,
    status: "received",
    attempts: 0,
  });

  if (insertErr) {
    // Don't block on log insert failures — still emit the event.
    console.error("[nuvemshop.webhook] webhook_events_log insert failed", insertErr.message);
  }

  // event_type for event_log must match `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`.
  // Map e.g. "order/created" -> "nuvemshop.order_created".
  const eventLogType = `nuvemshop.${event.replace("/", "_")}`;
  const { error: emitErr } = await admin.rpc("emit_event", {
    p_event_type: eventLogType,
    p_entity_kind: "nuvemshop_webhook",
    p_entity_id: null,
    p_payload: body as unknown as Record<string, unknown>,
    p_metadata: { external_id: externalId, store_id: storeId },
    p_organization_id: integration.organization_id,
  });
  if (emitErr) {
    console.error("[nuvemshop.webhook] emit_event failed", emitErr.message);
  }

  await audit({
    action: "nuvemshop.webhook_received",
    organizationId: integration.organization_id,
    resourceType: "nuvemshop_webhook",
    resourceId: externalId,
    metadata: { event, store_id: storeId },
  });

  return ok({ accepted: true });
}
