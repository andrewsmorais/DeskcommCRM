/**
 * Figurinhas salvas (migration 0516), contra o Postgres real e por JWT:
 * cada empresa lê só a própria biblioteca; authenticated não escreve (só o
 * servidor); a mesma figurinha (hash) não entra duas vezes na mesma empresa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 3 });

const ORG_A = "f1f1f1f1-0000-4000-8000-000000000001";
const ORG_B = "f1f1f1f1-0000-4000-8000-000000000002";
const ANA = "f1f1f1f1-1111-4000-8000-000000000001";
const BIA = "f1f1f1f1-1111-4000-8000-000000000002";
const H = (c: string) => c.repeat(64);

async function comoUsuario<T>(userId: string, f: (c: pg.PoolClient) => Promise<T>): Promise<T | string> {
  const cli = await pool.connect();
  try {
    await cli.query("begin");
    await cli.query("set local role authenticated");
    await cli.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
    return await f(cli);
  } catch (err) {
    return (err as Error).message;
  } finally {
    await cli.query("rollback");
    cli.release();
  }
}

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG_A, "figurinha-a"],
    [ORG_B, "figurinha-b"],
  ])
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name, timezone)
       values ($1, $2, $3, $4, 'America/Sao_Paulo') on conflict (id) do nothing`,
      [org, slug, slug, slug],
    );
  for (const [uid, org] of [
    [ANA, ORG_A],
    [BIA, ORG_B],
  ]) {
    await pool.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@t.test`]);
    await pool.query(
      `insert into user_organizations (user_id, organization_id, role, accepted_at) values ($1, $2, 'agent', now()) on conflict do nothing`,
      [uid, org],
    );
  }
  await pool.query(
    `insert into figurinhas (organization_id, storage_path, hash) values ($1, 'a/figurinhas/1.webp', $2), ($3, 'b/figurinhas/1.webp', $4)`,
    [ORG_A, H("a"), ORG_B, H("b")],
  );
});
afterAll(() => pool.end());

describe("figurinhas", () => {
  it("cada empresa lê só a própria biblioteca", async () => {
    const ler = (u: string) =>
      comoUsuario(u, async (c) => (await c.query<{ storage_path: string }>(`select storage_path from figurinhas`)).rows.map((r) => r.storage_path));
    expect(await ler(ANA)).toEqual(["a/figurinhas/1.webp"]);
    expect(await ler(BIA)).toEqual(["b/figurinhas/1.webp"]);
  });

  it("authenticated não insere nem apaga (só o servidor)", async () => {
    const ins = await comoUsuario(ANA, (c) =>
      c.query(`insert into figurinhas (organization_id, storage_path, hash) values ($1, 'x', $2)`, [ORG_A, H("c")]),
    );
    expect(String(ins)).toMatch(/permission denied/);
    const del = await comoUsuario(ANA, (c) => c.query(`delete from figurinhas`));
    expect(String(del)).toMatch(/permission denied/);
  });

  it("a mesma figurinha não entra duas vezes na mesma empresa (mas pode em outra)", async () => {
    await expect(
      pool.query(`insert into figurinhas (organization_id, storage_path, hash) values ($1, 'a/x.webp', $2)`, [ORG_A, H("a")]),
    ).rejects.toThrow(/figurinhas_uma_por_arquivo/);
    await pool.query(`insert into figurinhas (organization_id, storage_path, hash) values ($1, 'b/x.webp', $2)`, [ORG_B, H("a")]);
  });
});
