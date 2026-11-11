/**
 * Uma ligação de ENTRADA só cai num número cujo tronco é o mesmo por onde ela
 * chegou. Duas regras, as duas pelo nome do canal do Asterisk:
 *
 * 1. Chegou pelo tronco de uma organização (`PJSIP/org-<uuid>-trunk-endpoint-…`):
 *    o número tem de ser DELA — senão o tronco de A atendia (e criava contato e
 *    lead) no lugar de B.
 * 2. Chegou pelo tronco da INSTALAÇÃO (qualquer outro canal): o número tem de
 *    ter sido cadastrado no tronco da instalação. Número cadastrado para o
 *    tronco PRÓPRIO de uma empresa (`trunk_endpoint` = `PJSIP/org-…`) não
 *    captura ligação que chega pelo tronco do servidor — senão uma empresa com
 *    tronco próprio cadastrava o número do servidor e passava a atendê-lo.
 *
 * `trunk_endpoint` nulo (linha antiga, anterior à coluna) segue a regra antiga:
 * vale para o tronco da instalação.
 */
const CANAL_DE_TRONCO_DA_ORG = /^PJSIP\/org-([0-9a-f-]{36})-trunk-endpoint-/i;
const TRONCO_PROPRIO = /^(?:PJSIP\/)?org-[0-9a-f-]{36}-trunk-endpoint$/i;

export type MotivoDaRecusa = "tronco_de_outra_organizacao" | "numero_de_tronco_proprio";

export function recusaPeloTroncoDeChegada(
  nomeDoCanal: string | null | undefined,
  numero: { organization_id: string; trunk_endpoint: string | null },
): MotivoDaRecusa | null {
  const daOrg = CANAL_DE_TRONCO_DA_ORG.exec(nomeDoCanal ?? "");
  if (daOrg?.[1]) {
    return daOrg[1].toLowerCase() === numero.organization_id.toLowerCase()
      ? null
      : "tronco_de_outra_organizacao";
  }
  return numero.trunk_endpoint && TRONCO_PROPRIO.test(numero.trunk_endpoint)
    ? "numero_de_tronco_proprio"
    : null;
}
