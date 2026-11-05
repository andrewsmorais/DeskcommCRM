/**
 * OAuth state token (CSRF defense).
 *
 * Format: base64url(`${orgId}.${nonce}.${expMs}.${userId}.${authSessionId}`) +
 * "." + hex(HMAC-SHA256). Verified with `crypto.timingSafeEqual`. Tokens expire
 * 10 minutes after issuance.
 *
 * ⚠️ O `state` SEM ATOR (três segmentos) não é mais aceito. Ele não dizia quem
 * pediu a conexão, então a volta não tinha de quem queimar o nonce nem a quem
 * atribuir a escrita — e era o formato que um `state` forjado escolhia. Quem
 * emite (`connectNuvemshop`) sempre manda o ator.
 *
 * O `state` sozinho prova que o servidor o emitiu, não QUEM o apresenta: a
 * volta também exige o cookie de vínculo (`NOME_DO_VINCULO_DA_LOJA`, assinado
 * sobre o nonce, ver `lib/auth/vinculo-oauth.ts`) e queima o nonce.
 *
 * ⚠️ A chave NÃO é mais `INTERNAL_SECRET`. Ele é o Bearer que `autorizaCron`
 * aceita e que o operador entrega ao agendador externo; com ele, quem tinha o
 * relógio forjava o `state` de qualquer organização, e o callback gravava a loja
 * DELE na integração da vítima. A chave vem de `lib/auth/chave-de-assinatura.ts`.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";

const TTL_MS = 10 * 60 * 1000; // 10 min

/** O caminho da volta — o `path` do cookie de vínculo, para ele não viajar para mais nada. */
export const CAMINHO_DO_CALLBACK_DA_LOJA = "/api/v1/integrations/nuvemshop/callback";

/**
 * Nome próprio, e não o `crm_oauth_bind` da Agenda: o `path` já os separa, mas
 * dois cookies com o mesmo nome dependeriam disso para não se confundirem.
 * Não cita o provedor nem a marca (`lint:channels`, `branding.test.ts`).
 */
export const NOME_DO_VINCULO_DA_LOJA = "crm_oauth_bind_loja";

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

/**
 * @param nonce passado por quem emite quando ele precisa conhecê-lo — é o caso
 * de `connectNuvemshop`, que assina o cookie de vínculo sobre ele. Sem ponto:
 * o ponto é o separador da carga.
 */
export function issueState(
  orgId: string,
  actor: { userId: string; authSessionId: string },
  nonce: string = randomBytes(16).toString("hex"),
): string {
  if (!actor.userId || !nonce || nonce.includes(".")) {
    throw new Error("state da loja precisa do ator e de um nonce sem ponto");
  }
  const exp = Date.now() + TTL_MS;
  const payload = `${orgId}.${nonce}.${exp}.${actor.userId}.${actor.authSessionId}`;
  const sig = createHmac("sha256", key()).update(payload, "utf8").digest("hex");
  return `${b64urlEncode(payload)}.${sig}`;
}

export interface VerifiedState {
  userId: string;
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
  // Só o formato COM ator: o de três segmentos não dizia quem pediu.
  if (segments.length !== 5) return null;
  const [orgId, nonce, expStr, userId, authSessionId] = segments;
  const expMs = Number(expStr);
  if (!orgId || !nonce || !userId || !Number.isFinite(expMs)) return null;
  if (Date.now() > expMs) return null;

  return { orgId, nonce, expMs, userId, ...(authSessionId ? { authSessionId } : {}) };
}
