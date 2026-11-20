/**
 * O VÍNCULO ENTRE O NAVEGADOR E O `state` DE UM CONSENTIMENTO OAuth — para todo
 * retorno de provedor, e não só o da Agenda.
 *
 * A história de por que ele existe (o cookie de sessão é Strict e não viaja
 * na volta do provedor; a verificação que lia a sessão reprovava sempre) está no cabeçalho de `lib/agenda/google/vinculo.ts`, onde nasceu.
 * Aqui mora o mecanismo, porque ele passou a servir três retornos: Agenda,
 * Google Ads e loja. As opções do cookie moram em `cookie-de-vinculo.ts`, ao
 * lado: elas leem o ambiente (`cookieSecure`), e este arquivo fica puro para
 * poder ser importado antes de o ambiente existir — teste e worker inclusive.
 *
 * ─── O que ele fecha nos retornos que não o tinham ──────────────────────────
 *
 * Sem vínculo, o `state` assinado prova que o SERVIDOR o emitiu e que não
 * venceu — não prova QUEM o apresenta. O admin de uma organização X começava a
 * conexão, guardava a URL de consentimento com o `state` de X e fazia outra
 * pessoa aprová-la: o provedor devolvia o código DELA com o `state` de X, e o
 * CRM gravava o token da conta/loja da vítima na organização X — quantas vezes
 * quisesse, porque o nonce também não era queimado.
 *
 * Com o vínculo, a volta só fecha no navegador que saiu: a ida grava este
 * cookie, assinado sobre o nonce do `state`, e a volta recusa sem ele ANTES de
 * trocar o código. A queima do nonce (`calendar_oauth_nonces`, com prefixo por
 * fluxo) faz cada `state` valer uma vez.
 *
 * ─── Por que ASSINADO, e com chave própria por fluxo ────────────────────────
 *
 * O nonce viaja na barra de endereços, no histórico e no log do provedor; um
 * app irmão no mesmo domínio-pai consegue plantar cookie com o mesmo nome. Se o
 * valor esperado fosse o nonce em claro, bastaria plantá-lo. Assinado, plantar
 * exige a chave do servidor — que vem de `lib/auth/chave-de-assinatura.ts`, com
 * um rótulo por fluxo, para o vínculo de um provedor não servir em outro.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** O mesmo teto dos `state` (dez minutos). Um não pode durar mais que o outro. */
export const VALIDADE_DO_VINCULO_S = 10 * 60;

/** Assina o nonce do `state`. A chave é a do servidor, nunca algo derivável do que trafega. */
export function assinarVinculo(nonce: string, segredo: string): string {
  return createHmac("sha256", segredo).update(nonce, "utf8").digest("base64url");
}

/**
 * O cookie casa com o `state`?
 *
 * Compara em tempo constante e **não distingue os motivos da recusa** — ausente,
 * malformado e não-casando devolvem o mesmo `false`. Distinguir contaria a quem
 * ataca se o `state` que ele tem pertence a alguém que passou por aqui.
 */
export function vinculoConfere(
  valorDoCookie: string | undefined,
  nonce: string,
  segredo: string,
): boolean {
  if (!valorDoCookie || !nonce || !segredo) return false;
  const esperado = assinarVinculo(nonce, segredo);
  const a = Buffer.from(valorDoCookie, "utf8");
  const b = Buffer.from(esperado, "utf8");
  // `timingSafeEqual` lança quando os tamanhos diferem — por isso a checagem
  // vem antes, e não é um atalho de otimização.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
