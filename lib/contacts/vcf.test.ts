import { describe, expect, it } from "vitest";

import { CABECALHO_DO_VCF, pareceVcf, vcfParaLinhas } from "./vcf";

describe("vcfParaLinhas — o arquivo de contatos do celular vira linhas de planilha", () => {
  it("vCard 3.0 do iPhone/Google: nome, celular, e-mail e aniversário", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Silva;Ana;;;",
      "FN:Ana Silva",
      "item1.TEL;type=HOME:+55 11 3333-4444",
      "TEL;TYPE=CELL:+55 11 99999-8888",
      "EMAIL;TYPE=INTERNET:ana@example.com",
      "BDAY:1990-02-15",
      "END:VCARD",
    ].join("\r\n");
    expect(vcfParaLinhas(vcf)).toEqual([
      [...CABECALHO_DO_VCF],
      ["Ana Silva", "+55 11 99999-8888", "ana@example.com", "1990-02-15"],
    ]);
  });

  it("vCard 2.1 do Android com acento em quoted-printable e quebra suave", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Concei=C3=A7=C3=A3o;Jo=C3=A3o;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o Concei=",
      "=C3=A7=C3=A3o",
      "TEL;CELL:11988887777",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N:Souza;Bia;;;",
      "TEL;HOME:1133334444",
      "END:VCARD",
    ].join("\n");
    expect(vcfParaLinhas(vcf).slice(1)).toEqual([
      ["João Conceição", "11988887777", "", ""],
      ["Bia Souza", "1133334444", "", ""],
    ]);
  });

  it("linha dobrada, escapes, aniversário compacto e tel: do vCard 4.0", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Padaria Pão\\, Café",
      "  e Cia",
      "TEL;VALUE=uri;TYPE=cell:tel:+5521977776666",
      "BDAY:19851130",
      "END:VCARD",
    ].join("\n");
    expect(vcfParaLinhas(vcf)[1]).toEqual(["Padaria Pão, Café e Cia", "+5521977776666", "", "1985-11-30"]);
  });

  it("arquivo sem cartão devolve só o cabeçalho; aniversário sem ano fica vazio", () => {
    expect(vcfParaLinhas("isto não é um vcard")).toEqual([[...CABECALHO_DO_VCF]]);
    const semAno = vcfParaLinhas("BEGIN:VCARD\nFN:X\nTEL:1\nBDAY:--0215\nEND:VCARD");
    expect(semAno[1]![3]).toBe("");
  });

  it("reconhece o arquivo pelo nome ou pelo tipo", () => {
    expect(pareceVcf("Contatos.VCF", "")).toBe(true);
    expect(pareceVcf("a.bin", "text/x-vcard")).toBe(true);
    expect(pareceVcf("planilha.csv", "text/csv")).toBe(false);
  });
});
