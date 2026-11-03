import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO, normalizarIdioma } from "@/lib/i18n/idiomas";
import { checkRateLimit } from "@/lib/rate-limit";

/** O mínimo que o helper lê de uma requisição: os cabeçalhos (e o `ip`, quando a plataforma o expõe). */
type RequisicaoComIp = Pick<Request, "headers"> & { ip?: string };

export async function enforceRateLimit(
  _req: RequisicaoComIp,
  keyPrefix: string,
  keyId: string,
  maxRequests: number,
  windowMs: number,
) {
  const limitKey = `${keyPrefix}:${keyId}`;
  const { ok, retryAfterSeconds } = checkRateLimit(limitKey, maxRequests, windowMs);

  if (!ok) {
    let idioma = IDIOMA_PADRAO;
    try {
      const cookieStore = await cookies();
      idioma = normalizarIdioma(cookieStore.get("idioma")?.value);
    } catch {
      // Fora de uma requisição (teste, script): fica no idioma padrão.
    }

    return NextResponse.json(
      {
        error: traduzir("Muitas solicitações. Aguarde alguns segundos e tente novamente.", idioma),
      },
      {
        status: 429,
        headers: { "Retry-After": retryAfterSeconds.toString() },
      },
    );
  }

  return null;
}

export function getIp(req: RequisicaoComIp) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0] || req.ip || "127.0.0.1";
}
