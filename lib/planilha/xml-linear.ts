/**
 * Varredura de XML de planilha em tempo LINEAR, inclusive quando o XML é
 * malformado de propósito.
 *
 * Os leitores de XLSX (`lib/planilha/ler-arquivo.ts` e `lib/crm-b2b/spreadsheet.ts`)
 * liam `<si>`, `<row>`, `<c>`, `<t>`, `<v>`, `<sheet>` e `<Relationship>` com
 * expressões regulares do tipo `/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g`. Numa
 * tag aberta e nunca fechada, a regex procura o fechamento até o fim do texto,
 * falha, avança UM caractere e procura de novo: custo quadrático. A auditoria de
 * 18/11 (achado 7) mediu 12,7 s de processo travado com um upload de ~1 KB — o
 * processo do app é um só para todas as organizações da instalação.
 *
 * As duas funções daqui devolvem o mesmo que aquelas regexes devolviam em XLSX
 * bem formado, e nunca releem o texto:
 *
 *  - `elementos(xml, tag)`: cada `<tag ...>corpo</tag>` ou `<tag .../>`, em ordem.
 *    Se depois de uma posição não há `</tag>`, não há depois de nenhuma posição
 *    mais adiante; então o fechamento é procurado no máximo até a primeira busca
 *    que falha, e dali em diante só a forma autofechada ainda casa.
 *  - `aberturas(xml, tag)`: os atributos de cada `<tag ...>` de abertura, em ordem;
 *    para na primeira abertura sem `>`, porque nenhuma adiante teria.
 *
 * Fronteira de palavra: `<rows>` não é `<row>` e `<cols>` não é `<c>`.
 */

function continuaONome(ch: string | undefined): boolean {
  return ch !== undefined && /[\w:.-]/.test(ch);
}

/** `[atributos, corpo]` de cada elemento `tag`; corpo `undefined` quando autofechado. */
export function elementos(xml: string, tag: string): Array<[string, string | undefined]> {
  const abre = `<${tag}`;
  const fecha = `</${tag}>`;
  const out: Array<[string, string | undefined]> = [];
  let semFechamento = false;
  let i = 0;
  for (;;) {
    const a = xml.indexOf(abre, i);
    if (a === -1) break;
    const ini = a + abre.length;
    if (continuaONome(xml[ini])) {
      i = ini;
      continue;
    }
    const gt = xml.indexOf(">", ini);
    if (gt === -1) break;
    if (xml[gt - 1] === "/") {
      out.push([xml.slice(ini, gt - 1), undefined]);
      i = gt + 1;
      continue;
    }
    const f = semFechamento ? -1 : xml.indexOf(fecha, gt + 1);
    if (f === -1) {
      semFechamento = true;
      i = gt + 1;
      continue;
    }
    out.push([xml.slice(ini, gt), xml.slice(gt + 1, f)]);
    i = f + fecha.length;
  }
  return out;
}

/** Os atributos de cada abertura `<tag ...>`, em ordem. */
export function aberturas(xml: string, tag: string): string[] {
  const abre = `<${tag}`;
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const a = xml.indexOf(abre, i);
    if (a === -1) break;
    const ini = a + abre.length;
    if (continuaONome(xml[ini])) {
      i = ini;
      continue;
    }
    const gt = xml.indexOf(">", ini);
    if (gt === -1) break;
    out.push(xml.slice(ini, gt));
    i = gt + 1;
  }
  return out;
}

/** Última coluna do Excel: XFD, índice 16.383. */
export const XLSX_MAX_COLUNAS = 16_384;
/**
 * Nenhum import lê mais colunas que isto. Enquanto o cabeçalho não foi lido, é
 * o teto de largura de uma linha; depois dele, o teto é a largura do cabeçalho.
 */
export const XLSX_MAX_LARGURA = 256;

export const ERRO_DE_COLUNA = "Planilha com coluna além do limite do Excel.";

/**
 * O índice da coluna do atributo `r` de uma célula (`"A1"` → 0, `"AA7"` → 26),
 * `null` quando a célula não declara `r`, e `"invalida"` quando a referência
 * passa de três letras ou da coluna XFD. Antes, a referência não tinha teto e o
 * leitor completava a linha com vazios até ela: uma célula `r="ZZZZZ2"` num
 * upload de 642 bytes alocava 273 MiB.
 */
export function colunaDaCelula(atributos: string): number | null | "invalida" {
  const letras = /(?:^|\s)r="([A-Za-z]+)\d*"/.exec(atributos)?.[1];
  if (letras === undefined) return null;
  if (letras.length > 3) return "invalida";
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1 >= XLSX_MAX_COLUNAS ? "invalida" : n - 1;
}
