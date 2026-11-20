/**
 * Chat interno da equipe (migration 0515), contra o Postgres real e por JWT:
 *   - a sala Geral é de quem é da organização (a vizinha lê zero);
 *   - a conversa direta só as duas pessoas leem — nem o administrador;
 *   - a leitura (`equipe_leituras`) é só de quem ela é;
 *   - authenticated não escreve em nenhuma das duas (só o servidor);
 *   - as CHECKs barram mensagem vazia e mensagem para si.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 3 });

const ORG_A = "c4a7c4a7-0000-4000-8000-000000000001";
const ORG_B = "c4a7c4a7-0000-4000-8000-000000000002";
const ANA = "c4a7c4a7-1111-4000-8000-000000000001"; // A, atendente
const BIA = "c4a7c4a7-1111-4000-8000-000000000002"; // A, atendente
const CAIO = "c4a7c4a7-1111-4000-8000-000000000003"; // A, administrador
const DANI = "c4a7c4a7-1111-4000-8000-000000000004"; // B

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
const corpos = (userId: string) =>
  comoUsuario(userId, async (c) =>
    (await c.query<{ corpo: string }>(`select corpo from equipe_mensagens order by corpo`)).rows.map((r) => r.corpo),
  );

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG_A, "chat-equipe-a"],
    [ORG_B, "chat-equipe-b"],
  ])
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name, timezone)
       values ($1, $2, $3, $4, 'America/Sao_Paulo') on conflict (id) do nothing`,
      [org, slug, slug, slug],
    );
  for (const [uid, org, papel] of [
    [ANA, ORG_A, "agent"],
    [BIA, ORG_A, "agent"],
    [CAIO, ORG_A, "admin"],
    [DANI, ORG_B, "agent"],
  ]) {
    await pool.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@t.test`]);
    await pool.query(
      `insert into user_organizations (user_id, organization_id, role, accepted_at) values ($1, $2, $3, now()) on conflict do nothing`,
      [uid, org, papel],
    );
  }
  await pool.query(
    `insert into equipe_mensagens (organization_id, autor_user_id, destinatario_user_id, corpo) values
       ($1, $2, null, 'a-geral'),
       ($1, $2, $3, 'a-direta-ana-bia'),
       ($4, $5, null, 'b-geral')`,
    [ORG_A, ANA, BIA, ORG_B, DANI],
  );
  await pool.query(
    `insert into equipe_leituras (organization_id, user_id, conversa) values ($1, $2, 'geral'), ($1, $3, 'geral')`,
    [ORG_A, ANA, BIA],
  );
});

afterAll(() => pool.end());

describe("equipe_mensagens — quem lê", () => {
  it("as duas pessoas da conversa direta leem a Geral e a direta", async () => {
    expect(await corpos(ANA)).toEqual(["a-direta-ana-bia", "a-geral"]);
    expect(await corpos(BIA)).toEqual(["a-direta-ana-bia", "a-geral"]);
  });

  it("o administrador da mesma empresa lê a Geral, mas não a direta dos outros", async () => {
    expect(await corpos(CAIO)).toEqual(["a-geral"]);
  });

  it("a outra organização lê só a própria Geral", async () => {
    expect(await corpos(DANI)).toEqual(["b-geral"]);
  });
});

describe("equipe_leituras — só a própria", () => {
  it("cada um vê só a sua leitura", async () => {
    const r = await comoUsuario(ANA, async (c) => (await c.query(`select user_id from equipe_leituras`)).rows);
    expect(r).toEqual([{ user_id: ANA }]);
    const vizinha = await comoUsuario(DANI, async (c) => (await c.query(`select 1 from equipe_leituras`)).rowCount);
    expect(vizinha).toBe(0);
  });
});

describe("escrita só pelo servidor", () => {
  it("authenticated não insere, não altera e não apaga", async () => {
    const ins = await comoUsuario(ANA, (c) =>
      c.query(`insert into equipe_mensagens (organization_id, autor_user_id, corpo) values ($1, $2, 'x')`, [ORG_A, ANA]),
    );
    expect(String(ins)).toMatch(/permission denied/);
    const upd = await comoUsuario(ANA, (c) => c.query(`update equipe_mensagens set corpo = 'mudou'`));
    expect(String(upd)).toMatch(/permission denied/);
    const del = await comoUsuario(ANA, (c) => c.query(`delete from equipe_mensagens`));
    expect(String(del)).toMatch(/permission denied/);
    const lei = await comoUsuario(ANA, (c) =>
      c.query(`insert into equipe_leituras (organization_id, user_id, conversa) values ($1, $2, 'geral')`, [ORG_A, BIA]),
    );
    expect(String(lei)).toMatch(/permission denied/);
  });

  it("as CHECKs barram mensagem vazia e mensagem para si", async () => {
    await expect(
      pool.query(`insert into equipe_mensagens (organization_id, autor_user_id, corpo) values ($1, $2, '   ')`, [ORG_A, ANA]),
    ).rejects.toThrow(/check/i);
    await expect(
      pool.query(
        `insert into equipe_mensagens (organization_id, autor_user_id, destinatario_user_id, corpo) values ($1, $2, $2, 'eu')`,
        [ORG_A, ANA],
      ),
    ).rejects.toThrow(/equipe_mensagens_nao_para_si/);
  });
});
