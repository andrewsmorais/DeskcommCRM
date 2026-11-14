/**
 * ARQUIVAR UMA CAMPANHA DE PROSPECÇÃO (vindo do produto original, #4359) — o SQL
 * de verdade, num Postgres de verdade.
 *
 * O que fica travado:
 *   1. arquivar campanha RODANDO pausa no mesmo gesto (campanha escondida não envia);
 *   2. arquivar não apaga nada — candidatos ficam;
 *   3. desarquivar devolve PAUSADA (retomar é outro clique) e devolve `null` à
 *      configuração do rascunho que não tinha nenhuma;
 *   4. clicar duas vezes não reescreve o marcador;
 *   5. o filtro de organização: a mesma chamada com outra organização não toca nada.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { ARQUIVAR_CAMPANHA_SQL, DESARQUIVAR_CAMPANHA_SQL } from "@/lib/prospecting/arquivamento";
import { sql } from "./gov-helpers";

const orgA = "10000000-0000-4000-8000-0000000a4359";
const orgB = "10000000-0000-4000-8000-0000000b4359";
const rodando = "20000000-0000-4000-8000-0000000a4359";
const rascunho = "20000000-0000-4000-8000-0000000c4359";

/** Troca $1..$n pelos literais — o `sql()` dos invariantes fala psql puro. */
function comParametros(texto: string, valores: string[]): string {
  const update = valores.reduceRight(
    (acc, v, i) => acc.replaceAll(`$${i + 1}`, `'${v.replace(/'/g, "''")}'`),
    texto,
  );
  // CTE de escrita: a saída é só o `status` das linhas que mudaram ("" = nenhuma).
  return `with x as (${update}) select coalesce(string_agg(status, ','), '') from x`;
}

beforeAll(() =>
  sql(`insert into organizations(id,slug,legal_name,display_name) values
    ('${orgA}','arquivar-a','A','A'),('${orgB}','arquivar-b','B','B');
  insert into prospecting_campaigns(id,organization_id,request_id,name,search,config,status,search_status) values
    ('${rodando}','${orgA}',gen_random_uuid(),'Rodando','{}','{"daily_limit":10}','running','succeeded'),
    ('${rascunho}','${orgA}',gen_random_uuid(),'Rascunho','{}',null,'draft','succeeded');
  insert into prospecting_candidates(organization_id,campaign_id,place_id,data) values
    ('${orgA}','${rodando}','arq-1','{}'),('${orgA}','${rodando}','arq-2','{}');`),
);

describe("arquivar campanha de prospecção", () => {
  it("de OUTRA organização: nenhuma linha muda", () => {
    expect(
      sql(comParametros(ARQUIVAR_CAMPANHA_SQL, [orgB, rodando, "2026-11-14T10:00:00.000Z"])),
    ).toBe("");
    expect(sql(`select status from prospecting_campaigns where id='${rodando}'`)).toBe("running");
  });

  it("campanha rodando é PAUSADA no mesmo gesto, e nada é apagado", () => {
    const saida = sql(
      comParametros(ARQUIVAR_CAMPANHA_SQL, [orgA, rodando, "2026-11-14T10:00:00.000Z"]),
    );
    expect(saida).toContain("paused");
    expect(
      sql(
        `select status||'|'||(config->>'arquivada_em')||'|'||(config->>'daily_limit') from prospecting_campaigns where id='${rodando}'`,
      ),
    ).toBe("paused|2026-11-14T10:00:00.000Z|10");
    expect(sql(`select count(*) from prospecting_candidates where campaign_id='${rodando}'`)).toBe("2");
  });

  it("clicar de novo não reescreve o marcador", () => {
    expect(
      sql(comParametros(ARQUIVAR_CAMPANHA_SQL, [orgA, rodando, "2030-01-01T00:00:00.000Z"])),
    ).toBe("");
    expect(sql(`select config->>'arquivada_em' from prospecting_campaigns where id='${rodando}'`)).toBe(
      "2026-11-14T10:00:00.000Z",
    );
  });

  it("desarquivar devolve a campanha PAUSADA, com a configuração intacta", () => {
    expect(sql(comParametros(DESARQUIVAR_CAMPANHA_SQL, [orgA, rodando]))).toContain("paused");
    expect(
      sql(
        `select status||'|'||coalesce(config->>'arquivada_em','-')||'|'||(config->>'daily_limit') from prospecting_campaigns where id='${rodando}'`,
      ),
    ).toBe("paused|-|10");
  });

  it("rascunho sem configuração volta com `config` nula, não `{}`", () => {
    sql(comParametros(ARQUIVAR_CAMPANHA_SQL, [orgA, rascunho, "2026-11-14T10:00:00.000Z"]));
    expect(sql(`select status from prospecting_campaigns where id='${rascunho}'`)).toBe("draft");
    sql(comParametros(DESARQUIVAR_CAMPANHA_SQL, [orgA, rascunho]));
    expect(sql(`select config is null from prospecting_campaigns where id='${rascunho}'`)).toBe("t");
  });
});
