import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * `fn_vendas_por_campanha` (migration 0566): de qual campanha vieram os
 * contatos do período, e o que eles viraram no funil — nas cinco plataformas.
 *
 * Fixture própria (namespace `abab…`), com uma SEGUNDA organização cujo contato
 * vem da mesma campanha: o número da primeira não pode contá-lo.
 */
const ORG = "abababab-0000-4000-8000-000000000001";
const ORG_B = "abababab-0000-4000-8000-000000000002";
const FUNIL = "abababab-1111-4000-8000-000000000001";
const NOVO = "abababab-1111-4000-8000-000000000002";
const PROPOSTA = "abababab-1111-4000-8000-000000000003";
const PAGO = "abababab-1111-4000-8000-000000000004";
const FUNIL_B = "abababab-1111-4000-8000-000000000011";
const NOVO_B = "abababab-1111-4000-8000-000000000012";
const c = (n: number) => `abababab-2222-4000-8000-${String(n).padStart(12, "0")}`;

type Linha = {
  plataforma: string;
  campanha: string | null;
  contatos: number;
  negocios: number;
  avancaram: number;
  vendas: number;
  faturamento_cents: number;
};

function relatorio(org: string, desde = "now() - interval '30 days'"): Linha[] {
  const out = sql(
    `select coalesce(json_agg(t order by t.plataforma, t.campanha), '[]')
       from public.fn_vendas_por_campanha('${org}', ${desde}, now() + interval '1 minute') t;`,
  );
  return JSON.parse(out.trim() || "[]") as Linha[];
}

describe("fn_vendas_por_campanha", () => {
  beforeAll(() => {
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name) values
        ('${ORG}', 'vendas-campanha', 'Vendas por Campanha', 'VPC'),
        ('${ORG_B}', 'vendas-campanha-b', 'Vendas por Campanha B', 'VPC B')
        on conflict do nothing;
      insert into public.crm_pipelines (id, organization_id, name, slug) values
        ('${FUNIL}', '${ORG}', 'Vendas', 'vendas'),
        ('${FUNIL_B}', '${ORG_B}', 'Vendas', 'vendas')
        on conflict do nothing;
      insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position, is_won) values
        ('${NOVO}', '${ORG}', '${FUNIL}', 'Novo', 'novo', 1000, false),
        ('${PROPOSTA}', '${ORG}', '${FUNIL}', 'Proposta', 'proposta', 2000, false),
        ('${PAGO}', '${ORG}', '${FUNIL}', 'Pago', 'pago', 3000, true),
        ('${NOVO_B}', '${ORG_B}', '${FUNIL_B}', 'Novo', 'novo', 1000, false)
        on conflict do nothing;

      insert into public.contacts (id, organization_id, display_name, source_metadata) values
        ('${c(1)}', '${ORG}', 'TikTok comprou', '{}'),
        ('${c(2)}', '${ORG}', 'TikTok só chegou', '{}'),
        ('${c(3)}', '${ORG}', 'Pinterest avançou', '{}'),
        ('${c(4)}', '${ORG}', 'Anúncio de WhatsApp', '{"ad_platform":"meta_ads","ad_id":"999","ad_title":"Vídeo depoimento"}'),
        ('${c(5)}', '${ORG}', 'Google clique', '{}'),
        ('${c(6)}', '${ORG}', 'Sem origem', '{}'),
        ('${c(7)}', '${ORG}', 'Instagram pela UTM', '{}'),
        ('${c(8)}', '${ORG}', 'Taboola', '{}'),
        ('${c(9)}', '${ORG_B}', 'Outra organização', '{}')
        on conflict do nothing;

      insert into public.ad_hierarchy_cache (organization_id, platform, ad_id, campaign_id, campaign_name)
        values ('${ORG}', 'meta_ads', '999', '123', 'Black Friday Meta')
        on conflict do nothing;

      insert into public.meta_ads_click_refs (organization_id, token, utm, contact_id, matched_at) values
        ('${ORG}', 'VPC001', '{"utm_source":"tiktok","utm_campaign":"Black Friday TikTok"}', '${c(1)}', now()),
        ('${ORG}', 'VPC002', '{"utm_source":"TikTok","utm_campaign":"Black Friday TikTok"}', '${c(2)}', now()),
        ('${ORG}', 'VPC003', '{"utm_source":"pinterest","utm_campaign":"Decoração"}', '${c(3)}', now()),
        ('${ORG}', 'VPC007', '{"utm_source":"instagram","utm_campaign":"Stories"}', '${c(7)}', now()),
        ('${ORG}', 'VPC008', '{"utm_source":"Taboola","utm_campaign":"Matéria patrocinada"}', '${c(8)}', now()),
        ('${ORG_B}', 'VPC009', '{"utm_source":"tiktok","utm_campaign":"Black Friday TikTok"}', '${c(9)}', now())
        on conflict do nothing;
      insert into public.google_ads_click_refs (organization_id, token, gclid, query_raw, contact_id, matched_at) values
        ('${ORG}', 'VPG005', 'gclid-teste', '{"utm_campaign":"Pesquisa marca"}', '${c(5)}', now())
        on conflict do nothing;

      insert into public.crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, status, closed_at, value_cents) values
        ('${ORG}', '${FUNIL}', '${PAGO}', '${c(1)}', 'Pedido TikTok', 'won', now(), 19990),
        ('${ORG}', '${FUNIL}', '${NOVO}', '${c(2)}', 'Carrinho TikTok', 'open', null, 5000),
        ('${ORG}', '${FUNIL}', '${PROPOSTA}', '${c(3)}', 'Proposta Pinterest', 'open', null, null),
        ('${ORG}', '${FUNIL}', '${NOVO}', '${c(4)}', 'Lead WhatsApp', 'open', null, null),
        ('${ORG_B}', '${FUNIL_B}', '${NOVO_B}', '${c(9)}', 'Outra org', 'open', null, null);
    `);
  });

  it("separa as cinco plataformas e a campanha de cada contato", () => {
    const r = relatorio(ORG);
    const linha = (p: string, camp: string | null) => r.find((l) => l.plataforma === p && l.campanha === camp);

    expect(linha("tiktok", "Black Friday TikTok")).toMatchObject({
      contatos: 2,
      negocios: 2,
      avancaram: 1,
      vendas: 1,
      faturamento_cents: 19990,
    });
    expect(linha("pinterest", "Decoração")).toMatchObject({ contatos: 1, avancaram: 1, vendas: 0 });
    // Anúncio de clique para o WhatsApp: o nome da campanha vem do cache.
    expect(linha("meta", "Black Friday Meta")).toMatchObject({ contatos: 1, negocios: 1, avancaram: 0 });
    // UTM de Instagram conta como Meta.
    expect(linha("meta", "Stories")).toMatchObject({ contatos: 1, negocios: 0 });
    expect(linha("google", "Pesquisa marca")).toMatchObject({ contatos: 1 });
    expect(linha("taboola", "Matéria patrocinada")).toMatchObject({ contatos: 1 });
    expect(linha("sem_origem", null)).toMatchObject({ contatos: 1 });
  });

  it("o contato de outra organização da mesma campanha não entra na conta", () => {
    const tiktok = relatorio(ORG).find((l) => l.plataforma === "tiktok")!;
    expect(tiktok.contatos).toBe(2);
    expect(relatorio(ORG_B)).toEqual([
      expect.objectContaining({ plataforma: "tiktok", campanha: "Black Friday TikTok", contatos: 1 }),
    ]);
  });

  it("o período recorta os contatos que chegaram nele", () => {
    expect(relatorio(ORG, "now() + interval '10 seconds'")).toEqual([]);
  });

  it("só o servidor chama: login e visitante não executam a função", () => {
    const out = sql(
      `select has_function_privilege('authenticated', 'public.fn_vendas_por_campanha(uuid, timestamptz, timestamptz)', 'execute')::text
       || ',' || has_function_privilege('anon', 'public.fn_vendas_por_campanha(uuid, timestamptz, timestamptz)', 'execute')::text;`,
    );
    expect(out.trim().split("\n").at(-1)).toBe("false,false");
  });
});
