import { describe, expect, it } from "vitest";

import { aberturas, colunaDaCelula, elementos } from "@/lib/planilha/xml-linear";

/**
 * Auditoria de 18/11, achado 7: os leitores de XLSX varriam o XML com regexes
 * que, numa tag aberta e nunca fechada, procuravam o fechamento até o fim do
 * texto a cada caractere — 12,7 s de processo travado com ~1 KB de upload.
 *
 * Aqui se fixa as duas metades do conserto: o resultado em XML bem formado é o
 * MESMO das regexes antigas, e o tempo em XML malformado é linear.
 *
 * Sabotagem: trocar `elementos` pela regex antiga faz os casos de tempo
 * estourarem; tirar o `semFechamento` (procurar o fechamento de novo a cada
 * abertura) também — a busca "para a frente" sem essa memória continua
 * quadrática (4,1 s para 32 mil `<si>` medidos na auditoria).
 */

const REGEX_ANTIGA = {
  si: /<si>([\s\S]*?)<\/si>/g,
  row: /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,
  c: /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
  t: /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g,
};

const ABA = `<?xml version="1.0"?><worksheet><cols><col min="1" max="4"/></cols><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">x </t></is></c><c r="C2"><v>3</v></c><c r="D2" s="1"/></row>
<row r="3"/>
<rows>não é linha</rows>
</sheetData></worksheet>`;
const SST = `<sst><si><t>Empresa</t></si><si><r><t>Jos</t></r><r><t xml:space="preserve">é</t></r></si><si><t/></si></sst>`;

describe("elementos — o mesmo resultado das regexes antigas em XML bem formado", () => {
  it("<row> com atributos, corpo e forma autofechada; <rows> não é <row>", () => {
    const antigas = [...ABA.matchAll(REGEX_ANTIGA.row)].map((m) => [m[1], m[2]]);
    expect(elementos(ABA, "row")).toEqual(antigas);
  });

  it("<c> dentro de cada linha, sem confundir com <col>/<cols>", () => {
    for (const [, corpo] of elementos(ABA, "row")) {
      const antigas = [...(corpo ?? "").matchAll(REGEX_ANTIGA.c)].map((m) => [m[1], m[2]]);
      expect(elementos(corpo ?? "", "c")).toEqual(antigas);
    }
  });

  it("<si> e <t> (texto rico e xml:space)", () => {
    const si = [...SST.matchAll(REGEX_ANTIGA.si)].map((m) => m[1]);
    expect(elementos(SST, "si").map(([, c]) => c)).toEqual(si);
    const t = [...SST.matchAll(REGEX_ANTIGA.t)].map((m) => m[1]);
    // `<t/>` a regex antiga não via; aqui ele aparece como autofechado e vale "".
    expect(
      elementos(SST, "t")
        .filter(([, c]) => c !== undefined)
        .map(([, c]) => c),
    ).toEqual(t);
  });

  it("aberturas: atributos de cada <sheet ...>, sem contar <sheets>", () => {
    const wb = `<workbook><sheets><sheet name="A" r:id="rId2"/><sheet name="B" r:id="rId1"/></sheets></workbook>`;
    expect(aberturas(wb, "sheet")).toEqual([` name="A" r:id="rId2"/`, ` name="B" r:id="rId1"/`]);
  });
});

describe("elementos/aberturas — tempo linear em XML malformado", () => {
  const N = 200_000;
  const casos: Array<[string, string, string]> = [
    ["<si> sem </si>", "<si>".repeat(N), "si"],
    ["<row> sem </row>", '<row r="1">'.repeat(N), "row"],
    ["<c> sem </c>", '<c r="A1">'.repeat(N), "c"],
    ["<t> sem </t>", "<t>".repeat(N), "t"],
    ["<v> sem </v>", "<v>".repeat(N), "v"],
  ];
  for (const [nome, xml, tag] of casos) {
    it(`${nome} × ${N}: termina em menos de 1 s`, () => {
      const t0 = performance.now();
      const r = elementos(xml, tag);
      expect(performance.now() - t0).toBeLessThan(1_000);
      expect(r).toEqual([]);
    });
  }

  it("um fechamento lá no fim ainda é achado, e o resto não é relido", () => {
    const xml = "<si>".repeat(N) + "x</si>";
    const t0 = performance.now();
    expect(elementos(xml, "si")).toHaveLength(1);
    expect(performance.now() - t0).toBeLessThan(1_000);
  });

  it("<sheet e <Relationship sem '>' × 200 mil: menos de 1 s", () => {
    for (const tag of ["sheet", "Relationship"]) {
      const xml = `<${tag} Id="x" `.repeat(N);
      const t0 = performance.now();
      expect(aberturas(xml, tag)).toEqual([]);
      expect(performance.now() - t0).toBeLessThan(1_000);
    }
  });

  it("autofechadas depois de uma tag sem fechamento continuam sendo lidas", () => {
    expect(elementos(`<row r="1"><row r="2"/><row r="3"/>`, "row")).toEqual([
      [` r="2"`, undefined],
      [` r="3"`, undefined],
    ]);
  });
});

describe("colunaDaCelula", () => {
  it("A, Z, AA e XFD", () => {
    expect(colunaDaCelula(` r="A1"`)).toBe(0);
    expect(colunaDaCelula(` r="Z9" t="s"`)).toBe(25);
    expect(colunaDaCelula(` r="aa7"`)).toBe(26);
    expect(colunaDaCelula(` r="XFD1048576"`)).toBe(16_383);
  });

  it("sem r: null (a célula segue a anterior)", () => {
    expect(colunaDaCelula(` t="s"`)).toBeNull();
  });

  it("além de XFD ou com mais de três letras: inválida", () => {
    expect(colunaDaCelula(` r="XFE1"`)).toBe("invalida");
    expect(colunaDaCelula(` r="ZZZ1"`)).toBe("invalida");
    expect(colunaDaCelula(` r="ZZZZZ2"`)).toBe("invalida");
  });
});
