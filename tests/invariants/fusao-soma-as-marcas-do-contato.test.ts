import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * Auditoria de 18/11, achado 11 (migration 0557): juntar fichas não perde a
 * marca "pessoal" nem "sempre humano" da ficha que sai.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});

const ORG = "d0557000-0000-4000-8000-000000000001";

async function contato(id: string, marcas: { personal?: boolean; humano?: boolean } = {}) {
  await pool.query(
    "insert into contacts (id, organization_id, name, is_personal, ai_opt_out, force_human) values ($1,$2,$3,$4,$5,$6)",
    [id, ORG, `c-${id.slice(-4)}`, marcas.personal ?? false, marcas.humano ?? false, marcas.humano ?? false],
  );
  return id;
}
const mesclar = (p: string, s: string[]) =>
  pool.query("select public.fn_mesclar_contatos($1, $2, $3)", [ORG, p, s]);
const marcas = async (id: string) =>
  (
    await pool.query<{ is_personal: boolean; ai_opt_out: boolean; force_human: boolean }>(
      "select is_personal, ai_opt_out, force_human from contacts where id = $1",
      [id],
    )
  ).rows[0]!;

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'org-0557-marcas', 'Marcas LTDA', 'Marcas') on conflict (id) do nothing`,
    [ORG],
  );
});
afterAll(async () => {
  await pool.query("delete from organizations where id = $1", [ORG]);
  await pool.end();
});

describe("fn_mesclar_contatos — as marcas seguem a ficha que fica", () => {
  it("'pessoal' da que sai passa para a que fica", async () => {
    const v = await contato("d0557001-0000-4000-8000-000000000001");
    const p = await contato("d0557001-0000-4000-8000-000000000002", { personal: true });
    await mesclar(v, [p]);
    expect(await marcas(v)).toMatchObject({ is_personal: true, ai_opt_out: false });
  });

  it("'sempre humano' da que sai passa, e liga force_human", async () => {
    const v = await contato("d0557002-0000-4000-8000-000000000001");
    const p = await contato("d0557002-0000-4000-8000-000000000002", { humano: true });
    await mesclar(v, [p]);
    expect(await marcas(v)).toMatchObject({ ai_opt_out: true, force_human: true });
  });

  it("CONTROLE: sem marca na que sai, nada muda na que fica (e a marca da que fica sobrevive)", async () => {
    const v = await contato("d0557003-0000-4000-8000-000000000001", { personal: true });
    const p = await contato("d0557003-0000-4000-8000-000000000002");
    await mesclar(v, [p]);
    expect(await marcas(v)).toMatchObject({ is_personal: true, ai_opt_out: false });
    const v2 = await contato("d0557004-0000-4000-8000-000000000001");
    const p2 = await contato("d0557004-0000-4000-8000-000000000002");
    await mesclar(v2, [p2]);
    expect(await marcas(v2)).toMatchObject({ is_personal: false, ai_opt_out: false, force_human: false });
  });
});
