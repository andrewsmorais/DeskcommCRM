/**
 * PASSAR A CONVERSA PARA OUTRO AGENTE (migration 0523) — o schema num Postgres
 * de verdade.
 *
 *   1. a trilha aceita `outcome = 'transferred'` com `origem = 'acao'`;
 *   2. `motivo` é vocabulário FECHADO (texto livre seria porta de PII);
 *   3. linhas antigas/sem origem nascem `classificador`.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const org = "10000000-0000-4000-8000-0000000a0523";

beforeAll(() =>
  sql(`insert into organizations(id,slug,legal_name,display_name) values ('${org}','passagem-0523','P','P');`),
);

describe("passagem entre agentes de IA (0523)", () => {
  it("a trilha aceita transferred/acao com motivo do vocabulário", () => {
    expect(
      sql(`with x as (insert into ai_router_decisions(organization_id,outcome,origem,motivo)
           values ('${org}','transferred','acao','pedido_do_agente') returning outcome||'|'||origem as r) select r from x`),
    ).toBe("transferred|acao");
  });

  it("motivo fora do vocabulário é recusado", () => {
    expect(() =>
      sql(`insert into ai_router_decisions(organization_id,outcome,origem,motivo)
           values ('${org}','transferred','acao','porque o cliente disse X')`),
    ).toThrow();
  });

  it("linha sem origem nasce 'classificador'", () => {
    expect(
      sql(`with x as (insert into ai_router_decisions(organization_id,outcome) values ('${org}','classified') returning origem) select origem from x`),
    ).toBe("classificador");
  });
});
