import { describe, expect, it } from "vitest";

import { recusaPeloTroncoDeChegada } from "./tronco-de-chegada";

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
