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

/**
 * O tronco (no formato gravado em `phone_numbers.trunk_endpoint`) por onde a
 * ligação chegou: `PJSIP/org-<uuid>-trunk-endpoint` para o tronco de uma
 * organização, `null` para o tronco da instalação.
 */
export function troncoDoCanal(nomeDoCanal: string | null | undefined): string | null {
  const daOrg = CANAL_DE_TRONCO_DA_ORG.exec(nomeDoCanal ?? "");
  return daOrg?.[1] ? `PJSIP/org-${daOrg[1].toLowerCase()}-trunk-endpoint` : null;
}

/**
 * Entre os cadastros ATIVOS de um número (o mesmo número pode existir em
 * troncos diferentes — um por tronco), qual atende a ligação que chegou por
 * este canal. Pelo tronco de uma organização, o cadastro desse tronco; pelo da
 * instalação, o cadastro que não é de tronco próprio. Mais de um candidato é
 * ambíguo: devolve `null` em vez de adivinhar.
 *
 * Serve também ao caminho `s` (tronco de DID único, sem número discado): ali
 * as linhas são TODOS os números ativos, e o recorte pelo tronco de chegada é
 * o que impede o número de outra empresa de tornar a resolução ambígua.
 */
export function escolherCadastroPeloTronco<T extends { trunk_endpoint: string | null }>(
  linhas: ReadonlyArray<T>,
  nomeDoCanal: string | null | undefined,
): T | null {
  const tronco = troncoDoCanal(nomeDoCanal);
  const candidatos = linhas.filter((l) =>
    tronco
      ? (l.trunk_endpoint ?? "").toLowerCase() === tronco.toLowerCase()
      : !(l.trunk_endpoint && TRONCO_PROPRIO.test(l.trunk_endpoint)),
  );
  return candidatos.length === 1 ? candidatos[0]! : null;
}

