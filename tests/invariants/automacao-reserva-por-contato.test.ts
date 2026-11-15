/**
 * RESERVA DE "UMA VEZ POR CONTATO" (migration 0524) — tabela só do servidor.
 *
 * `automation_rule_contact_claims` é o árbitro da corrida do motor: RLS ligada,
 * nenhuma policy e nenhum grant a `authenticated`. Prova pelo comportamento,
 * com dois tenants reais por JWT: o admin de cada organização não lê nenhuma
 * linha (nem a própria, nem a vizinha) e não consegue gravar; e o índice único
 * recusa a segunda reserva da mesma (organização, regra, contato).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG_A = "6e6e6e6e-0000-4000-8000-000000000001";
const ORG_B = "6e6e6e6e-0000-4000-8000-000000000002";
const ADMIN_A = "6e6e6e6e-1111-4000-8000-000000000001";
const ADMIN_B = "6e6e6e6e-1111-4000-8000-000000000002";
const REGRA_A = "6e6e6e6e-2222-4000-8000-000000000001";
const REGRA_B = "6e6e6e6e-2222-4000-8000-000000000002";
const CONTATO_A = "6e6e6e6e-3333-4000-8000-000000000001";
const CONTATO_B = "6e6e6e6e-3333-4000-8000-000000000002";

function como(userId: string, comando: string): number | "negado" {
  try {
    const out = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
      ${comando}
    `);
    const ultima = out.split("\n").at(-1) ?? "";
    return /^\d+$/.test(ultima) ? Number(ultima) : "negado";
  } catch {
    return "negado";
  }
}
const nadaOuNegado = (r: number | "negado") => r === 0 || r === "negado";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ADMIN_A}', 'reserva-a@invariant.test'), ('${ADMIN_B}', 'reserva-b@invariant.test');
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'reserva-a', 'Reserva A', 'Reserva A'),
      ('${ORG_B}', 'reserva-b', 'Reserva B', 'Reserva B');
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}', '${ORG_A}', 'admin', now()), ('${ADMIN_B}', '${ORG_B}', 'admin', now());
    insert into public.automation_rules (id, organization_id, name, trigger_event) values
      ('${REGRA_A}', '${ORG_A}', 'A', 'lead.created'), ('${REGRA_B}', '${ORG_B}', 'B', 'lead.created');
    insert into public.contacts (id, organization_id, phone_number) values
      ('${CONTATO_A}', '${ORG_A}', '+5511990000001'), ('${CONTATO_B}', '${ORG_B}', '+5511990000002');
    insert into public.automation_rule_contact_claims (organization_id, rule_id, contact_id) values
      ('${ORG_A}', '${REGRA_A}', '${CONTATO_A}'), ('${ORG_B}', '${REGRA_B}', '${CONTATO_B}');
  `);
});

describe("automation_rule_contact_claims é só do servidor", () => {
  it("o servidor tem a reserva das duas organizações", () => {
    expect(
      sql(`select count(*) from public.automation_rule_contact_claims where organization_id in ('${ORG_A}','${ORG_B}');`),
    ).toBe("2");
  });

  it("admin de cada organização não lê nada — nem a própria, nem a vizinha", () => {
    for (const u of [ADMIN_A, ADMIN_B]) {
      expect(nadaOuNegado(como(u, "select count(*) from public.automation_rule_contact_claims;"))).toBe(true);
    }
  });

  it("admin não consegue gravar reserva direto", () => {
    const r = como(
      ADMIN_A,
      `with w as (insert into public.automation_rule_contact_claims (organization_id, rule_id, contact_id)
        values ('${ORG_A}', '${REGRA_A}', '${CONTATO_A}') returning 1) select count(*) from w;`,
    );
    expect(nadaOuNegado(r)).toBe(true);
  });

  it("a segunda reserva da mesma chave não entra (o árbitro da corrida)", () => {
    expect(
      sql(`with w as (insert into public.automation_rule_contact_claims (organization_id, rule_id, contact_id)
        values ('${ORG_A}', '${REGRA_A}', '${CONTATO_A}') on conflict do nothing returning 1) select count(*) from w;`),
    ).toBe("0");
  });
});
