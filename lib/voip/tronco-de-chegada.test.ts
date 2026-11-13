import { describe, expect, it } from "vitest";

import { escolherCadastroPeloTronco, recusaPeloTroncoDeChegada, troncoDoCanal } from "./tronco-de-chegada";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

describe("recusaPeloTroncoDeChegada", () => {
  it("tronco da organização A, número de B: recusa", () => {
    expect(
      recusaPeloTroncoDeChegada(`PJSIP/org-${A}-trunk-endpoint-00000001`, {
        organization_id: B,
        trunk_endpoint: `PJSIP/org-${B}-trunk-endpoint`,
      }),
    ).toBe("tronco_de_outra_organizacao");
  });

  it("CONTROLE: tronco de A, número de A: aceita", () => {
    expect(
      recusaPeloTroncoDeChegada(`PJSIP/org-${A}-trunk-endpoint-00000001`, {
        organization_id: A,
        trunk_endpoint: `PJSIP/org-${A}-trunk-endpoint`,
      }),
    ).toBeNull();
  });

  it("tronco da instalação, número cadastrado para o tronco próprio de uma empresa: recusa", () => {
    expect(
      recusaPeloTroncoDeChegada("PJSIP/trunk-endpoint-00000007", {
        organization_id: B,
        trunk_endpoint: `PJSIP/org-${B}-trunk-endpoint`,
      }),
    ).toBe("numero_de_tronco_proprio");
  });

  it("CONTROLE: tronco da instalação, número do tronco da instalação (ou linha antiga sem tronco): aceita", () => {
    expect(
      recusaPeloTroncoDeChegada("PJSIP/trunk-endpoint-00000007", {
        organization_id: B,
        trunk_endpoint: "PJSIP/trunk-endpoint",
      }),
    ).toBeNull();
    expect(recusaPeloTroncoDeChegada(undefined, { organization_id: B, trunk_endpoint: null })).toBeNull();
  });
});

describe("escolherCadastroPeloTronco — o mesmo número em troncos diferentes", () => {
  const daInstalacao = { organization_id: A, trunk_endpoint: "PJSIP/trunk-endpoint" };
  const doTroncoDeB = { organization_id: B, trunk_endpoint: `PJSIP/org-${B}-trunk-endpoint` };

  it("pelo tronco da instalação, atende o cadastro da instalação (não o do tronco próprio de B)", () => {
    expect(escolherCadastroPeloTronco([doTroncoDeB, daInstalacao], "PJSIP/trunk-endpoint-0000001")).toBe(daInstalacao);
  });

  it("pelo tronco de B, atende o cadastro de B", () => {
    expect(escolherCadastroPeloTronco([daInstalacao, doTroncoDeB], `PJSIP/org-${B}-trunk-endpoint-00000009`)).toBe(
      doTroncoDeB,
    );
  });

  it("pelo tronco de A sem cadastro de A: ninguém atende", () => {
    expect(escolherCadastroPeloTronco([daInstalacao, doTroncoDeB], `PJSIP/org-${A}-trunk-endpoint-00000009`)).toBeNull();
  });

  it("caminho 's': o número ativo de outra empresa não torna ambígua a resolução do tronco da instalação", () => {
    expect(escolherCadastroPeloTronco([daInstalacao, doTroncoDeB], "PJSIP/trunk-endpoint-0000001")).toBe(daInstalacao);
    const outroDaInstalacao = { organization_id: B, trunk_endpoint: "PJSIP/trunk-endpoint" };
    expect(
      escolherCadastroPeloTronco([daInstalacao, outroDaInstalacao, doTroncoDeB], "PJSIP/trunk-endpoint-0000001"),
    ).toBeNull();
  });

  it("troncoDoCanal: tronco de organização vira o formato do cadastro; o da instalação é nulo", () => {
    expect(troncoDoCanal(`PJSIP/org-${B}-trunk-endpoint-00000009`)).toBe(`PJSIP/org-${B}-trunk-endpoint`);
    expect(troncoDoCanal("PJSIP/trunk-endpoint-0000001")).toBeNull();
  });
});

