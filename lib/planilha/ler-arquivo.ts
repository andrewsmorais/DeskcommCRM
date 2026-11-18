/**
 * Leitura de planilha neutra (CSV e XLSX), usada pelo import B2B e pela prospecção.
 *
 * Mora em `lib/planilha/` e não em `lib/crm-b2b/` porque o módulo B2B pode estar
 * desligado, e a prospecção (núcleo) não importa de dentro de um módulo.
 *
 * CSV reusa o parser do importador de contatos (`lib/contacts/csv.ts`): RFC 4180,
 * detecta `;` do Excel em português, decodifica Latin-1.
 *
 * XLSX é lido com `fflate`, que JÁ está instalado (o pacote de skills descompacta
 * com ele). O PR original trazia `exceljs` só para isto: MIT, mas 21,8 MB
 * desempacotado, nove dependências diretas (archiver, unzipper, jszip, tmp…) e
 * ~100 pacotes novos no lockfile, para ler a PRIMEIRA aba de uma planilha. Um
 * `.xlsx` é um zip de XML; o que se lê aqui é o mínimo desse formato: a primeira
 * aba do `workbook.xml`, a tabela de textos compartilhados e as células. O que
 * fica de fora de propósito: fórmula (vale o último valor calculado, que o Excel
 * grava), estilo, data (sai o número de série; nenhum campo importado é data) e
 * `.xls` binário antigo — este é recusado com mensagem, em vez de virar lixo.
 */
import { strFromU8, unzipSync } from "fflate";

import { decodificarCsv, parseCsvComLinhas } from "@/lib/contacts/csv";
import {
  aberturas,
  colunaDaCelula,
  elementos,
  ERRO_DE_COLUNA,
  XLSX_MAX_LARGURA,
} from "@/lib/planilha/xml-linear";

export type SheetMatrix = {
  headers: string[];
  rows: string[][];
  /** Posição original de cada entrada de `rows`, quando lida de um arquivo. */
  rowNumbers?: number[];
};
type LinhaLida = { cells: string[]; rowNumber: number };

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_DATA_ROWS = 2_000;
/**
 * Teto do XML DESCOMPACTADO por arquivo do zip. Os 2 MB do upload são do zip; XML
 * repetitivo comprime 100x, e sem este teto um arquivo pequeno vira centenas de
 * megabytes de memória no servidor.
 */
const XLSX_MAX_XML_BYTES = 40 * 1024 * 1024;
/**
 * Teto da SOMA de tudo que o leitor descompacta, nas duas passadas. O teto por
 * arquivo sozinho não segura: um zip de 2 MB cabe dezenas de entradas de quase
 * 40 MB cada (XML repetido comprime ~1000x), e o `unzipSync` guardava todas na
 * memória ao mesmo tempo — a auditoria de 18/11 (achado 7) mediu ~40 MiB a mais
 * no processo do app para cada ~41 KB de upload. O fflate infla cada entrada num
 * buffer do tamanho DECLARADO e não passa dele, então somar o declarado limita a
 * memória de verdade. Mesmo valor do leitor do import B2B.
 */
const XLSX_MAX_TOTAL_XML_BYTES = 48 * 1024 * 1024;
const XLSX_MAX_ROW_NUMBER = 1_048_576;

export type Leitura = { ok: true; sheet: SheetMatrix } | { ok: false; error: string };

export function isXlsxFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".xlsx");
}

export function isCsvFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".csv");
}

export type OpcoesDeLeitura = { maxLinhas?: number };

export async function parseImportFile(
  bytes: ArrayBuffer,
  filename: string,
  opcoes: OpcoesDeLeitura = {},
): Promise<Leitura> {
  const maxLinhas = opcoes.maxLinhas ?? IMPORT_MAX_DATA_ROWS;
  if (bytes.byteLength > IMPORT_MAX_BYTES) {
    return { ok: false, error: `Arquivo maior que ${IMPORT_MAX_BYTES} bytes.` };
  }
  if (isXlsxFilename(filename)) return parseXlsx(bytes, maxLinhas);
  if (isCsvFilename(filename)) return parseCsvBytes(bytes, maxLinhas);
  return { ok: false, error: "Formato não suportado — envie .csv ou .xlsx." };
}

/** Cabeçalho + linhas, cada linha aparada ou completada até a largura do cabeçalho. */
function matrizParaPlanilha(matrix: LinhaLida[], maxLinhas: number): Leitura {
  if (matrix.length < 2) {
    return { ok: false, error: "Preciso de cabeçalho e ao menos uma linha de dados." };
  }
  const headers = matrix[0]!.cells.map((h) => h.trim());
  const rows = matrix.slice(1);
  if (rows.length > maxLinhas) {
    return { ok: false, error: `Máximo de ${maxLinhas} linhas de dados.` };
  }
  const width = headers.length;
  const normalized = rows.map(({ cells }) => {
    const out = cells.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  });
  return {
    ok: true,
    sheet: { headers, rows: normalized, rowNumbers: rows.map(({ rowNumber }) => rowNumber) },
  };
}

function parseCsvBytes(bytes: ArrayBuffer, maxLinhas: number): Leitura {
  const decoded = decodificarCsv(bytes);
  if ("erro" in decoded) return { ok: false, error: decoded.erro };
  return matrizParaPlanilha(parseCsvComLinhas(decoded.texto), maxLinhas);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificarXml(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (inteira, e: string) => {
    if (e[0] === "#") {
      const codigo = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
    }
    return ENTIDADES[e.toLowerCase()] ?? inteira;
  });
}

/** O texto de um `<si>` ou `<is>`: todos os `<t>`, inclusive os de texto rico (`<r><t>`). */
function textoDosRuns(xml: string): string {
  let out = "";
  for (const [, corpo] of elementos(xml, "t")) out += decodificarXml(corpo ?? "");
  return out;
}

function valorDaCelula(attrs: string, corpo: string, compartilhados: string[]): string {
  const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1];
  if (tipo === "inlineStr") return textoDosRuns(corpo);
  const v = elementos(corpo, "v").find(([, c]) => c !== undefined)?.[1];
  if (v === undefined) return "";
  if (tipo === "s") return compartilhados[Number(v)] ?? "";
  if (tipo === "b") return v === "1" ? "TRUE" : "FALSE";
  if (tipo === "str" || tipo === "e" || tipo === "d") return decodificarXml(v);
  // Número: `String(Number(v))` desfaz o "1.1222333000181E+13" que alguns
  // geradores gravam para um CNPJ ou telefone digitado como número.
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : v;
}

const ERRO_DE_LEITURA: Leitura = { ok: false, error: "Não consegui ler o arquivo XLSX." };
const ERRO_DE_TAMANHO: Leitura = { ok: false, error: "Planilha grande demais para importar de uma vez." };

/**
 * Descompacta SÓ o que é lido, em duas passadas: primeiro o `workbook.xml` e os
 * vínculos dele (para achar a primeira aba), depois essa aba e os textos
 * compartilhados. As outras abas nunca são infladas. O teto por arquivo e o da
 * soma valem nas duas passadas juntas, como no leitor do import B2B.
 *
 * Todo XML é lido com `elementos`/`aberturas` (`lib/planilha/xml-linear.ts`),
 * lineares mesmo com tag sem fechamento; a largura de cada linha tem teto; e o
 * limite de linhas vale DURANTE a leitura, não só depois dela.
 */
function parseXlsx(bytes: ArrayBuffer, maxLinhas: number): Leitura {
  const zip = new Uint8Array(bytes);
  let declarado = 0;
  let grandeDemais = false;
  const abrir = (quer: (nome: string) => boolean): Record<string, Uint8Array> | null => {
    try {
      return unzipSync(zip, {
        filter: (f) => {
          if (grandeDemais || !quer(f.name)) return false;
          declarado += f.originalSize;
          if (f.originalSize > XLSX_MAX_XML_BYTES || declarado > XLSX_MAX_TOTAL_XML_BYTES) {
            grandeDemais = true;
            return false;
          }
          return true;
        },
      });
    } catch {
      return null;
    }
  };
  const texto = (arquivos: Record<string, Uint8Array>, nome: string) => {
    const a = arquivos[nome];
    return a ? strFromU8(a) : null;
  };

  const meta = abrir((n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels");
  if (meta === null) return ERRO_DE_LEITURA;
  if (grandeDemais) return ERRO_DE_TAMANHO;
  const workbook = texto(meta, "xl/workbook.xml");
  if (workbook === null) return ERRO_DE_LEITURA;

  // A PRIMEIRA aba na ordem das abas, que não é necessariamente `sheet1.xml`.
  const rid = aberturas(workbook, "sheet")
    .map((a) => /(?:^|\s)r:id="([^"]+)"/.exec(a)?.[1])
    .find((id) => id !== undefined);
  const rels = texto(meta, "xl/_rels/workbook.xml.rels") ?? "";
  let alvo: string | undefined;
  for (const a of aberturas(rels, "Relationship")) {
    if (a.includes(`Id="${rid}"`)) alvo = /Target="([^"]+)"/.exec(a)?.[1];
  }
  const caminho = alvo ? `xl/${alvo.replace(/^\/?xl\//, "").replace(/^\//, "")}` : "xl/worksheets/sheet1.xml";
  // Só uma aba de verdade é inflada: um vínculo apontando para outra parte do zip
  // não faz o leitor descompactar o que não é planilha.
  const ehAba = /^xl\/worksheets\/[^/]+\.xml$/.test(caminho);
  const dados = abrir((n) => (ehAba && n === caminho) || n === "xl/sharedStrings.xml");
  if (dados === null) return ERRO_DE_LEITURA;
  if (grandeDemais) return ERRO_DE_TAMANHO;
  const aba = ehAba ? texto(dados, caminho) : null;
  if (aba === null) return { ok: false, error: "Planilha vazia." };

  const compartilhados = elementos(texto(dados, "xl/sharedStrings.xml") ?? "", "si").map(([, corpo]) =>
    textoDosRuns(corpo ?? ""),
  );

  const matriz: LinhaLida[] = [];
  // Largura máxima de uma linha: o teto fixo até o cabeçalho ser lido; depois, a
  // largura do cabeçalho — `matrizParaPlanilha` apara o resto de qualquer jeito,
  // então coluna além dela nunca chega a ser materializada.
  let largura = XLSX_MAX_LARGURA;
  let rowNumber = 0;
  for (const [attrs, corpo] of elementos(aba, "row")) {
    // O XLSX pode omitir os registros das linhas em branco. O atributo r é o
    // índice na aba. Se estiver ausente, segue a sequência das linhas lidas.
    const declarado = Number(/(?:^|\s)r="(\d+)"/.exec(attrs)?.[1]);
    rowNumber = declarado > rowNumber && declarado <= XLSX_MAX_ROW_NUMBER ? declarado : rowNumber + 1;
    const celulas: string[] = [];
    // Valor além da largura não é guardado, mas a linha continua contando como
    // preenchida — como antes, quando ela saía aparada e em branco.
    let preenchidaAlem = false;
    for (const [attrsDaCelula, corpoDaCelula] of elementos(corpo ?? "", "c")) {
      const coluna = colunaDaCelula(attrsDaCelula);
      if (coluna === "invalida") return { ok: false, error: ERRO_DE_COLUNA };
      const i = coluna ?? celulas.length;
      const valor = valorDaCelula(attrsDaCelula, corpoDaCelula ?? "", compartilhados);
      if (i >= largura) {
        preenchidaAlem ||= valor.trim() !== "";
        continue;
      }
      while (celulas.length < i) celulas.push("");
      celulas[i] = valor;
    }
    if (preenchidaAlem || celulas.some((v) => v.trim() !== "")) {
      if (matriz.length === 0) largura = celulas.length;
      matriz.push({ cells: celulas, rowNumber });
      if (matriz.length > maxLinhas + 1) {
        return { ok: false, error: `Máximo de ${maxLinhas} linhas de dados.` };
      }
    }
  }
  return matrizParaPlanilha(matriz, maxLinhas);
}
