import { loadOnboardingChannel } from "@/lib/channels/onboarding-session";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";

/**
 * Proxy WAHA's QR endpoint so the browser can <img src="..." /> without
 * exposing the API key.
 *
 * WAHA exposes: GET /api/{session}/auth/qr?format=image → image/png bytes.
 */
export async function GET() {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  // O QR É o pareamento do canal da organização: o mesmo piso de quem inicia a
  // conexão (`../session`, POST): admin, com a MFA provada. Antes qualquer
  // membro recebia a imagem (auditoria de 04/11/2026).
  const authz = await requireRole("admin", {
    resource: "channel_sessions",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return new NextResponse(null, { status: authz.response.status });
  if (await mfaEmDivida()) return new NextResponse(null, { status: 403 });
  const activeOrg = authz.org;

  const baseUrl = process.env.WAHA_API_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey || apiKey === "dev_plaintext_change_me") {
    return new NextResponse(null, { status: 503 });
  }

  const channel = await loadOnboardingChannel(await createClient(), activeOrg.orgId);
  if (!channel || channel.archived_at) return new NextResponse(null, { status: 404 });
  const sessionName = channel.waha_session_name;
  const upstream = await fetch(
    `${baseUrl}/api/${encodeURIComponent(sessionName)}/auth/qr?format=image`,
    { headers: { "X-Api-Key": apiKey }, cache: "no-store" },
  );
  if (!upstream.ok) {
    return new NextResponse(null, {
      status: upstream.status,
      headers: { "x-waha-status": String(upstream.status) },
    });
  }

  const ct = upstream.headers.get("content-type") ?? "image/png";
  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": ct,
      "cache-control": "no-store, max-age=0",
    },
  });
}
