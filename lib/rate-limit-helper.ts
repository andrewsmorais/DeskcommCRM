import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { traduzir } from "@/lib/i18n/dicionario";
import { cookies } from "next/headers";

export async function enforceRateLimit(
  req: any,
  keyPrefix: string,
  keyId: string,
  maxRequests: number,
  windowMs: number
) {
  const limitKey = `${keyPrefix}:${keyId}`;
  const { ok, retryAfterSeconds } = checkRateLimit(limitKey, maxRequests, windowMs);

  if (!ok) {
    let idioma = "pt-BR" as any;
    try {
      const cookieStore = await cookies();
      idioma = cookieStore.get("idioma")?.value || "pt-BR";
    } catch (e) {}

    return NextResponse.json(
      { error: traduzir("Muitas solicitações. Aguarde alguns segundos e tente novamente.", idioma) },
      {
        status: 429,
        headers: { "Retry-After": retryAfterSeconds.toString() }
      }
    );
  }

  return null;
}

export function getIp(req: any) {
  const forwarded = req.headers?.get ? req.headers.get("x-forwarded-for") : null;
  return forwarded?.split(",")[0] || req.ip || "127.0.0.1";
}
