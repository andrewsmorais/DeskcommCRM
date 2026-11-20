import { describe, expect, it } from "vitest";

import { caminhoDeMidiaDaEmpresa, caminhoDeMidiaLiteral, isMediaPathOwnedBy } from "./upload-validation";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";

describe("caminho de mídia: literal, sem pedaço que a URL resolveria", () => {
  it("o caminho canônico passa", () => {
    expect(isMediaPathOwnedBy(`${ORG}/${CONV}/abc.jpg`, ORG, CONV)).toBe(true);
    expect(caminhoDeMidiaDaEmpresa(`${ORG}/figurinhas/${"a".repeat(64)}.webp`, ORG)).toBe(true);
    expect(caminhoDeMidiaDaEmpresa(`${ORG}/${CONV}/uuid-Relatório final (1).pdf`, ORG)).toBe(true);
  });

  it("'..' depois do prefixo da própria empresa é recusado (auditoria de 14/11)", () => {
    const fuga = `${ORG}/${CONV}/../../${OUTRA}/${CONV}/x.png`;
    expect(isMediaPathOwnedBy(fuga, ORG, CONV)).toBe(false);
    expect(caminhoDeMidiaDaEmpresa(fuga, ORG)).toBe(false);
    // E a URL resolveria mesmo: é por isso que a recusa existe.
    expect(new URL(`http://s/object/whatsapp-media/${fuga}`).pathname).toBe(`/object/whatsapp-media/${OUTRA}/${CONV}/x.png`);
  });

  it("segmento vazio, '.', codificado, barra invertida, ?, # e controle são recusados", () => {
    for (const ruim of [`${ORG}/${CONV}//x.png`, `${ORG}/${CONV}/./x.png`, `${ORG}/${CONV}/%2e%2e/x.png`, `${ORG}/${CONV}/..\\x.png`, `${ORG}/${CONV}/x.png?y`, `${ORG}/${CONV}/x.png#y`, `${ORG}/${CONV}/x\u0000.png`, `${ORG}/${CONV}/`])
      expect(caminhoDeMidiaLiteral(ruim), ruim).toBe(false);
  });

  it("arquivo de outra empresa, vazio e nulo não passam", () => {
    expect(caminhoDeMidiaDaEmpresa(`${OUTRA}/${CONV}/x.png`, ORG)).toBe(false);
    expect(caminhoDeMidiaDaEmpresa(null, ORG)).toBe(false);
    expect(caminhoDeMidiaDaEmpresa("", ORG)).toBe(false);
  });
});
