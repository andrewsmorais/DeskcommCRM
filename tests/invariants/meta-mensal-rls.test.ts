import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * A META DO MÊS NÃO VAZA ENTRE ORGANIZAÇÕES E SÓ GERENTE ESCREVE (migration 0549).
 *
 * Prova pelo mesmo caminho da produção (`set role authenticated` + claims):
 * 1. controle positivo — quem é da organização lê a meta dela;
 * 2. isolamento — zero linhas da vizinha;
 * 3. escrita — `agent` NÃO grava (a RLS recusa), `manager` grava;
 * 4. a constraint do 1º dia do mês recusa "2026-10-15";
 * 5. ninguém de `authenticated` apaga meta (sem policy nem GRANT de DELETE).
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

function sql(script: string, aceitarErro = false): string {
  const r = spawnSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      ...(aceitarErro ? [] : ["-v", "ON_ERROR_STOP=1"]), "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  );
  // Com `aceitarErro` a recusa do banco É o dado: devolve stdout + stderr.
  if (!aceitarErro && r.status !== 0) throw new Error(`psql falhou: ${r.stderr}`);
  return `${r.stdout}${aceitarErro ? r.stderr : ""}`.trim();
}

function como(userId: string, comando: string): string {
  return sql(
    `set role authenticated;
     select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
     ${comando}`,
    true,
  );
}

const ORG_A = "3e7a0a49-0000-4000-8000-00000000000a";
const ORG_B = "3e7a0a49-0000-4000-8000-00000000000b";
const AGENT_A = "3e7a0a49-1111-4000-8000-00000000000a";
const MANAGER_A = "3e7a0a49-1111-4000-8000-00000000000d";
const MANAGER_B = "3e7a0a49-1111-4000-8000-00000000000e";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}', 'meta-agent-a@invariant.test'),
      ('${MANAGER_A}', 'meta-mgr-a@invariant.test'),
      ('${MANAGER_B}', 'meta-mgr-b@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'meta-inv-a', 'Meta Invariant A', 'Meta A'),
      ('${ORG_B}', 'meta-inv-b', 'Meta Invariant B', 'Meta B')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;
    delete from public.crm_metas where organization_id in ('${ORG_A}', '${ORG_B}');
    insert into public.crm_metas (organization_id, periodo, indicador, alvo) values
      ('${ORG_A}', '2026-10-01', 'vendas_ganhas', 40),
      ('${ORG_B}', '2026-10-01', 'vendas_ganhas', 99);
  `);
});

describe("crm_metas — RLS", () => {
  it("quem é da organização lê a meta dela (controle positivo)", () => {
    const out = como(AGENT_A, `select count(*) from public.crm_metas where organization_id = '${ORG_A}';`);
    expect(out.split("\n").pop()).toBe("1");
  });

  it("não enxerga a meta da organização vizinha", () => {
    const out = como(AGENT_A, `select count(*) from public.crm_metas where organization_id = '${ORG_B}';`);
    expect(out.split("\n").pop()).toBe("0");
  });

  it("agent não grava meta; manager grava", () => {
    const agente = como(
      AGENT_A,
      `insert into public.crm_metas (organization_id, periodo, alvo) values ('${ORG_A}', '2026-11-01', 5);`,
    );
    expect(agente).toMatch(/row-level security|violates/i);

    const gerente = como(
      MANAGER_A,
      `insert into public.crm_metas (organization_id, periodo, alvo) values ('${ORG_A}', '2026-11-01', 5);`,
    );
    expect(gerente).toMatch(/INSERT 0 1/);
  });

  it("manager de uma organização não grava na vizinha", () => {
    const out = como(
      MANAGER_B,
      `insert into public.crm_metas (organization_id, periodo, alvo) values ('${ORG_A}', '2026-12-01', 5);`,
    );
    expect(out).toMatch(/row-level security|violates/i);
  });

  it("recusa período que não é o 1º dia do mês", () => {
    const out = como(
      MANAGER_A,
      `insert into public.crm_metas (organization_id, periodo, alvo) values ('${ORG_A}', '2027-01-15', 5);`,
    );
    expect(out).toMatch(/crm_metas_periodo_e_o_primeiro_dia/);
  });

  it("authenticated não apaga meta", () => {
    const out = como(MANAGER_A, `delete from public.crm_metas where organization_id = '${ORG_A}';`);
    expect(out).toMatch(/permission denied/i);
  });
});
