import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseImportFile } from "@/lib/planilha/ler-arquivo";

/**
 * O leitor de XLSX da prospecção (núcleo). A auditoria de 18/11 (achado 7)
 * mediu três modos de um upload pequeno derrubar o processo do app, que é um só
 * para todas as organizações da instalação:
 *
 *  1. soma do que é descompactado sem teto (~40 MiB por ~41 KB de upload);
 *  2. tag sem fechamento lida por regex quadrática (12,7 s com ~1 KB);
 *  3. referência de coluna sem teto: `r="ZZZZZ2"` completava a linha até a
 *     coluna 12 milhões (273 MiB com 642 bytes).
 *
 * Cada caso abaixo fixa um deles, e os de controle fixam que a planilha comum
 * sai IGUAL a antes.
 */

function zip(partes: Record<string, string>, guardado = false): ArrayBuffer {
  const z = zipSync(
    Object.fromEntries(
      Object.entries(partes).map(([k, v]) => [
        k,
        guardado ? [strToU8(v), { level: 0 }] : strToU8(v),
      ]),
    ),
  );
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="r"><sheets>
<sheet name="Leads" sheetId="2" r:id="rId2"/><sheet name="Outra" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const RELS = `<?xml version="1.0"?><Relationships>
<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
const SST = `<sst><si><t>Empresa</t></si><si><t>Telefone</t></si><si><t>Silva &amp; Filhos</t></si>
<si><r><t>Jos</t></r><r><t xml:space="preserve">é</t></r></si></sst>`;
const ABA_ERRADA = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>não sou a primeira</t></is></c></row></sheetData></worksheet>`;

function aba(linhas: string): string {
  return `<?xml version="1.0"?><worksheet><cols><col min="1" max="3"/></cols><sheetData>${linhas}</sheetData></worksheet>`;
}
const CABECALHO = `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`;

function planilha(
  sheet2: string,
  extra: Record<string, string> = {},
  guardado = false,
): ArrayBuffer {
  return zip(
    {
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/sharedStrings.xml": SST,
      "xl/worksheets/sheet1.xml": ABA_ERRADA,
      "xl/worksheets/sheet2.xml": sheet2,
      ...extra,
    },
    guardado,
  );
}

/** Mexe só no tamanho DECLARADO no diretório central, ou estraga o deflate. */
function editarZip(
  buf: ArrayBuffer,
  editar: (e: { nome: string; declarar: (n: number) => void; estragar: () => void }) => void,
): ArrayBuffer {
  const d = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let fim = u8.length - 22;
  while (d.getUint32(fim, true) !== 0x06054b50) fim--;
  const total = d.getUint16(fim + 10, true);
  let o = d.getUint32(fim + 16, true);
  for (let i = 0; i < total; i++) {
    const tamNome = d.getUint16(o + 28, true);
    const nome = new TextDecoder().decode(u8.subarray(o + 46, o + 46 + tamNome));
    const local = d.getUint32(o + 42, true);
    const cd = o;
    editar({
      nome,
      declarar: (n) => d.setUint32(cd + 24, n, true),
      estragar: () => {
        const dados = local + 30 + d.getUint16(local + 26, true) + d.getUint16(local + 28, true);
        u8[dados] = 0x07;
      },
    });
    o += 46 + tamNome + d.getUint16(o + 30, true) + d.getUint16(o + 32, true);
  }
  return buf;
}
const MB = 1024 * 1024;

describe("parseImportFile (prospecção) — planilha comum sai igual a antes", () => {
  it("primeira aba pela ordem do workbook, texto compartilhado, rico, inline e célula pulada", async () => {
    const r = await parseImportFile(
      planilha(
        aba(
          CABECALHO +
            `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1.1999990001E+10</v></c></row>` +
            `<row r="3"/>` +
            `<row r="5"><c r="B5" t="inlineStr"><is><t>(11) 98888-0000</t></is></c></row>` +
            `<row r="6"><c r="A6" t="s"><v>3</v></c></row>`,
        ),
      ),
      "p.xlsx",
    );
    expect(r).toEqual({
      ok: true,
      sheet: {
        headers: ["Empresa", "Telefone"],
        rows: [
          ["Silva & Filhos", "11999990001"],
          ["", "(11) 98888-0000"],
          ["José", ""],
        ],
        rowNumbers: [2, 5, 6],
      },
    });
  });

  it("500 linhas passam e 501 recusam, como antes", async () => {
    const linhas = (n: number) =>
      Array.from(
        { length: n },
        (_, i) =>
          `<row r="${i + 2}"><c r="A${i + 2}" t="inlineStr"><is><t>E${i}</t></is></c><c r="B${i + 2}"><v>${11900000000 + i}</v></c></row>`,
      ).join("");
    const quinhentas = await parseImportFile(planilha(aba(CABECALHO + linhas(500))), "p.xlsx", {
      maxLinhas: 500,
    });
    expect(quinhentas.ok && quinhentas.sheet.rows.length).toBe(500);
    const quinhentasEUma = await parseImportFile(planilha(aba(CABECALHO + linhas(501))), "p.xlsx", {
      maxLinhas: 500,
    });
    expect(quinhentasEUma).toEqual({ ok: false, error: "Máximo de 500 linhas de dados." });
  });

  it("valor além da largura do cabeçalho é aparado; a linha que só tinha isso continua, em branco", async () => {
    const r = await parseImportFile(
      planilha(
        aba(
          CABECALHO +
            `<row r="2"><c r="A2" t="inlineStr"><is><t>X</t></is></c><c r="B2"><v>1</v></c><c r="E2"><v>9</v></c></row>` +
            `<row r="3"><c r="F3" t="inlineStr"><is><t>só aqui</t></is></c></row>`,
        ),
      ),
      "p.xlsx",
    );
    expect(r).toEqual({
      ok: true,
      sheet: {
        headers: ["Empresa", "Telefone"],
        rows: [
          ["X", "1"],
          ["", ""],
        ],
        rowNumbers: [2, 3],
      },
    });
  });
});

describe("parseImportFile (prospecção) — upload pequeno não derruba o processo", () => {
  it("aba que não é a primeira nunca é descompactada", async () => {
    const extras = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`xl/worksheets/extra${i}.xml`, ABA_ERRADA.repeat(20)]),
    );
    const buf = editarZip(
      planilha(aba(CABECALHO + `<row r="2"><c r="A2"><v>1</v></c></row>`), extras),
      (e) => {
        if (e.nome.includes("/extra")) {
          e.estragar();
          e.declarar(30 * MB);
        }
      },
    );
    expect((await parseImportFile(buf, "p.xlsx")).ok).toBe(true);
  });

  it("a soma do que é descompactado tem teto, não só cada arquivo", async () => {
    // Aba e textos compartilhados declaram 30 MB cada: cada um passa no teto de
    // 40 MB, a soma não. Entradas GUARDADAS: o declarado não aloca nada aqui.
    const sheet = aba(CABECALHO + `<row r="2"><c r="A2"><v>1</v></c></row>`);
    const buf = editarZip(planilha(sheet, {}, true), (e) => {
      if (e.nome === "xl/worksheets/sheet2.xml" || e.nome === "xl/sharedStrings.xml")
        e.declarar(30 * MB);
    });
    expect(await parseImportFile(buf, "p.xlsx")).toEqual({
      ok: false,
      error: "Planilha grande demais para importar de uma vez.",
    });
    // Controle: o mesmo arquivo, com o declarado verdadeiro, é lido.
    expect((await parseImportFile(planilha(sheet, {}, true), "p.xlsx")).ok).toBe(true);
  });

  it('célula r="ZZZZZ2" (ou além de XFD) é recusada em milissegundos', async () => {
    for (const ref of ["ZZZZZ2", "XFE2", "ZZZ2"]) {
      const t0 = performance.now();
      const r = await parseImportFile(
        planilha(aba(CABECALHO + `<row r="2"><c r="${ref}"><v>1</v></c></row>`)),
        "p.xlsx",
      );
      expect(performance.now() - t0).toBeLessThan(200);
      expect(r).toEqual({ ok: false, error: "Planilha com coluna além do limite do Excel." });
    }
  });

  it("2.000 linhas que só preenchem XFD: nenhuma linha larga é montada e o limite vale durante a leitura", async () => {
    const linhas = Array.from(
      { length: 2_000 },
      (_, i) => `<row r="${i + 2}"><c r="XFD${i + 2}"><v>1</v></c></row>`,
    ).join("");
    const t0 = performance.now();
    const r = await parseImportFile(planilha(aba(CABECALHO + linhas)), "p.xlsx", {
      maxLinhas: 500,
    });
    expect(performance.now() - t0).toBeLessThan(500);
    expect(r).toEqual({ ok: false, error: "Máximo de 500 linhas de dados." });
  });

  it("tags sem fechamento na aba, nos textos, no workbook e nos vínculos: menos de 2 s cada", async () => {
    const N = 100_000;
    const casos: Record<string, ArrayBuffer> = {
      row: planilha(aba(CABECALHO + '<row r="2">'.repeat(N))),
      c: planilha(aba(CABECALHO + `<row r="2">${'<c r="A2">'.repeat(N)}</row>`)),
      v: planilha(aba(CABECALHO + `<row r="2"><c r="A2">${"<v>".repeat(N)}</c></row>`)),
      t: planilha(
        aba(CABECALHO + `<row r="2"><c r="A2" t="inlineStr"><is>${"<t>".repeat(N)}</is></c></row>`),
      ),
      si: planilha(aba(CABECALHO), { "xl/sharedStrings.xml": SST + "<si>".repeat(N) }),
      // Sem nenhuma aba válida: a regex antiga não achava casamento e recomeçava
      // a cada `<sheet` (com uma válida antes, ela parava cedo e o teste não mediria nada).
      sheet: planilha(aba(CABECALHO), {
        "xl/workbook.xml": `<workbook><sheets>${'<sheet name="a" '.repeat(N)}`,
      }),
      Relationship: planilha(aba(CABECALHO), {
        "xl/_rels/workbook.xml.rels": RELS + `<Relationship Id="x" `.repeat(N),
      }),
    };
    for (const [tag, buf] of Object.entries(casos)) {
      expect(buf.byteLength, tag).toBeLessThan(2 * MB);
      const t0 = performance.now();
      await parseImportFile(buf, "p.xlsx");
      expect(performance.now() - t0, tag).toBeLessThan(2_000);
    }
  });
});
