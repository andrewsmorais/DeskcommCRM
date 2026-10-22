/**
 * O link de exportação — assinado, com prazo, e SEM estado no banco.
 *
 * ─── Por que um link assinado e não a sessão ────────────────────────────────
 *
 * O link chega por e-mail a quem JÁ perdeu o acesso: a assinatura acabou, a
 * conta está suspensa, e é exatamente aí que a pessoa precisa dos dados. Exigir
 * login derrubaria o único caso para o qual a exportação existe. A autorização
 * vem da assinatura: só quem tem a chave do servidor consegue fabricar um link
 * que aponta para uma organização.
 *
 * A organização vai DENTRO do link e é lida dele — nunca de query ou corpo. O
 * link que expirou, foi adulterado ou nunca existiu devolve a mesma coisa
 * (`null`), para a rota responder 404 sem dizer qual dos três foi.
 *
 * A chave é derivada do segredo interno com um rótulo próprio: se esse segredo
 * for trocado, os links em circulação morrem junto, e isso é o comportamento
 * certo — um novo e-mail os substitui.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const ROTULO = "exportacao-da-conta-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAMANHO_MAXIMO = 300;
const SEGREDO_MINIMO = 16;

function chaveDe(segredo: string): Buffer {
  return createHmac("sha256", segredo).update(ROTULO).digest();
}

function b64(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64url");
}

function assinatura(payload: string, segredo: string): string {
  return createHmac("sha256", chaveDe(segredo)).update(payload).digest("base64url");
}

/** `null` quando não há segredo utilizável — fail-closed, nunca link sem assinatura. */
export function assinarLink(
  args: { orgId: string; expiraEm: Date },
  segredo: string,
): string | null {
  if (!segredo || segredo.length < SEGREDO_MINIMO) return null;
  if (!UUID.test(args.orgId)) return null;
  const payload = `${args.orgId.toLowerCase()}.${Math.floor(args.expiraEm.getTime() / 1000)}`;
  return `${b64(payload)}.${assinatura(payload, segredo)}`;
}

export function verificarLink(
  token: string,
  segredo: string,
  agora: Date = new Date(),
): { orgId: string; expiraEm: Date } | null {
  if (!segredo || segredo.length < SEGREDO_MINIMO) return null;
  if (typeof token !== "string" || token.length === 0 || token.length > TAMANHO_MAXIMO) return null;

  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const corpo = partes[0];
  const mac = partes[1];
  if (corpo === undefined || mac === undefined) return null;

  let payload: string;
  try {
    payload = Buffer.from(corpo, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const esperado = Buffer.from(assinatura(payload, segredo));
  const recebido = Buffer.from(mac);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;

  const m = /^([0-9a-f-]{36})\.(\d{1,12})$/.exec(payload);
  const orgId = m?.[1];
  const segundos = m?.[2];
  if (orgId === undefined || segundos === undefined || !UUID.test(orgId)) return null;
  const expiraEm = new Date(Number(segundos) * 1000);
  if (!(expiraEm.getTime() > agora.getTime())) return null;
  return { orgId, expiraEm };
}
