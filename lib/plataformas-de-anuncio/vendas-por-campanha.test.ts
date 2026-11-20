import { describe, expect, it } from "vitest";

import { utmsDoLink } from "./rastreio/contrato";
import { agruparPorPlataforma, periodoDaUrl, taxaDeVenda } from "./vendas-por-campanha";

const linha = (plataforma: string, campanha: string | null, vendas = 0, contatos = 1, fat = 0) => ({
  plataforma,
  campanha,
  contatos,
  negocios: contatos,
  avancaram: vendas,
  vendas,
  faturamento_cents: fat,
});

describe("agruparPorPlataforma", () => {
  it("ordem fixa das plataformas, campanha que mais vende primeiro, e o total do grupo", () => {
    const g = agruparPorPlataforma([
      linha("pinterest", "Decoração", 0, 3),
      linha("tiktok", "Fraca", 0, 10),
      linha("tiktok", "Forte", 2, 4, 30000),
      linha("meta", "Stories", 1, 2, 9900),
      linha("sem_origem", null, 0, 7),
    ]);
    expect(g.map((x) => x.plataforma)).toEqual(["meta", "tiktok", "pinterest", "sem_origem"]);
    const tiktok = g.find((x) => x.plataforma === "tiktok")!;
    expect(tiktok.campanhas.map((c) => c.campanha)).toEqual(["Forte", "Fraca"]);
    expect(tiktok.total).toMatchObject({ contatos: 14, vendas: 2, faturamentoCents: 30000 });
  });

  it("plataforma desconhecida cai em Outras origens", () => {
    expect(agruparPorPlataforma([linha("kwai", "x")])[0]!.plataforma).toBe("outra");
  });
});

describe("taxaDeVenda e período", () => {
  it("vendas ÷ contatos com uma casa; sem contatos não há taxa", () => {
    expect(taxaDeVenda({ vendas: 1, contatos: 3 })).toBe(33.3);
    expect(taxaDeVenda({ vendas: 0, contatos: 0 })).toBeNull();
  });
  it("período fora da lista volta para 30 dias", () => {
    expect(periodoDaUrl("7")).toBe(7);
    expect(periodoDaUrl("365")).toBe(30);
    expect(periodoDaUrl(undefined)).toBe(30);
  });
});

describe("marcador de plataforma que não foi trocado não vira campanha", () => {
  const link = { utm: {}, use_case: "anuncio" as const, name: "Link da loja" };
  it("TikTok fora do anúncio manda __CAMPAIGN_NAME__ cru: fica o nome do link", () => {
    expect(
      utmsDoLink(link, new URLSearchParams("utm_source=tiktok&utm_campaign=__CAMPAIGN_NAME__")),
    ).toMatchObject({ utm_source: "tiktok", utm_campaign: "Link da loja" });
  });
  it("com o nome trocado pela plataforma, a campanha é a do anúncio", () => {
    expect(
      utmsDoLink(link, new URLSearchParams("utm_source=pinterest&utm_campaign=Decoração Natal")),
    ).toMatchObject({ utm_source: "pinterest", utm_campaign: "Decoração Natal" });
  });
});
