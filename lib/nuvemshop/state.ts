/**
 * OAuth state token (CSRF defense).
 *
 * Format: base64url(`${orgId}.${nonce}.${expMs}`) + "." + hex(HMAC-SHA256).
 * Verified with `crypto.timingSafeEqual`. Tokens expire 10 minutes after issuance.
 *
 * ⚠️ A chave NÃO é mais `INTERNAL_SECRET`. Ele é o Bearer que `autorizaCron`
 * aceita e que o operador entrega ao agendador externo; com ele, quem tinha o
 * relógio forjava o `state` de qualquer organização, e o callback gravava a loja
 * DELE na integração da vítima. A chave vem de `lib/auth/chave-de-assinatura.ts`.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";

const TTL_MS = 10 * 60 * 1000; // 10 min

function key(): string {
  // Sem raiz utilizável (dev sem `SUPABASE_SERVICE_ROLE_KEY`) cai numa chave
  // aleatória por processo — o `state` funciona dentro de um processo de dev, e
  // reiniciar invalida os fluxos abertos. Em produção a raiz é obrigatória.
  const secret = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDaLoja);
  if (secret.length >= 16) return secret;
  // Memoize per-process fallback.
  if (!fallbackKey) fallbackKey = randomBytes(32).toString("hex");
  return fallbackKey;
}

let fallbackKey: string | null = null;

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export function issueState(
  orgId: string,
  actor?: { userId: string; authSessionId: string },
): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Date.now() + TTL_MS;
  const payload = `${orgId}.${nonce}.${exp}${actor ? `.${actor.userId}.${actor.authSessionId}` : ""}`;
  const sig = createHmac("sha256", key()).update(payload, "utf8").digest("hex");
  return `${b64urlEncode(payload)}.${sig}`;
}

export interface VerifiedState {
  userId?: string;
  authSessionId?: string;
  orgId: string;
  nonce: string;
  expMs: number;
}

export function verifyState(token: string | null | undefined): VerifiedState | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, sigHex] = parts;
  if (!encodedPayload || !sigHex) return null;
  let payload: string;
  try {
    payload = b64urlDecode(encodedPayload);
  } catch {
    return null;
  }

  const expectedSig = createHmac("sha256", key()).update(payload, "utf8").digest();
  let receivedSig: Buffer;
  try {
    receivedSig = Buffer.from(sigHex, "hex");
  } catch {
    return null;
  }
  if (receivedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(receivedSig, expectedSig)) return null;

  const segments = payload.split(".");
  if (segments.length !== 3 && segments.length !== 5) return null;
  const [orgId, nonce, expStr, userId, authSessionId] = segments;
  const expMs = Number(expStr);
  if (!orgId || !nonce || !Number.isFinite(expMs)) return null;
  if (Date.now() > expMs) return null;

  return { orgId, nonce, expMs, ...(userId && authSessionId ? { userId, authSessionId } : {}) };
}
