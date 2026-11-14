/**
 * Telefone oculto (migration 0517), contra o Postgres real e por JWT:
 *   - `fn_eu_oculto_telefone` responde pela linha de QUEM CHAMA, na organização
 *     pedida (ou em qualquer uma, sem organização);
 *   - anon não executa a função;
 *   - o número mascarado nunca é gravado no contato (CHECK de E.164 já existente).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 3 });

const ORG_A = "7e7e7e7e-0000-4000-8000-000000000001";
const ORG_B = "7e7e7e7e-0000-4000-8000-000000000002";
const ANA = "7e7e7e7e-1111-4000-8000-000000000001"; // marcada em A
const BIA = "7e7e7e7e-1111-4000-8000-000000000002"; // não marcada

async function como<T>(papel: "authenticated" | "anon", userId: string | null, f: (c: pg.PoolClient) => Promise<T>): Promise<T | string> {
  const cli = await pool.connect();
  try {
    await cli.query("begin");
    await cli.query(`set local role ${papel}`);
    if (userId) await cli.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
    return await f(cli);
  } catch (err) {
    return (err as Error).message;
  } finally {
    await cli.query("rollback");
    cli.release();
  }
}
const oculto = (u: string, org: string | null) =>
  como("authenticated", u, async (c) => (await c.query<{ r: boolean }>(`select public.fn_eu_oculto_telefone($1::uuid) as r`, [org])).rows[0]?.r);

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG_A, "tel-oculto-a"],
    [ORG_B, "tel-oculto-b"],
  ])
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name, timezone)
       values ($1, $2, $3, $4, 'America/Sao_Paulo') on conflict (id) do nothing`,
      [org, slug, slug, slug],
    );
  for (const [uid, org, marcado] of [
    [ANA, ORG_A, true],
    [ANA, ORG_B, false],
    [BIA, ORG_A, false],
  ] as const) {
    await pool.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@t.test`]);
    await pool.query(
      `insert into user_organizations (user_id, organization_id, role, accepted_at, ocultar_telefone)
       values ($1, $2, 'agent', now(), $3) on conflict do nothing`,
      [uid, org, marcado],
    );
  }
});
afterAll(() => pool.end());

describe("telefone oculto", () => {
  it("responde pela linha de quem chama, na organização pedida", async () => {
    expect(await oculto(ANA, ORG_A)).toBe(true);
    expect(await oculto(ANA, ORG_B)).toBe(false);
    expect(await oculto(BIA, ORG_A)).toBe(false);
  });

  it("sem organização, o lado seguro: marcada em alguma, oculta", async () => {
    expect(await oculto(ANA, null)).toBe(true);
    expect(await oculto(BIA, null)).toBe(false);
  });

  it("anon não executa a função", async () => {
    const r = await como("anon", null, (c) => c.query(`select public.fn_eu_oculto_telefone(null)`));
    expect(String(r)).toMatch(/permission denied/);
  });

  it("o número mascarado nunca é gravado no contato (a trava do formato E.164 recusa)", async () => {
    const erro = await pool
      .query(`insert into contacts (organization_id, name, phone_number, source) values ($1, 'X', '+55•••••••••88', 'manual')`, [ORG_A])
      .then(() => null, (e: { constraint?: string }) => e);
    expect(erro?.constraint).toBe("contacts_phone_e164_format");
  });
});
