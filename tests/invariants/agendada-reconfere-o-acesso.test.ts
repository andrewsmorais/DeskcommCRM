/**
 * Mensagem agendada: na hora de sair, o worker reconfere se quem agendou AINDA
 * enxerga a conversa (auditoria de 14/11/2026). A pergunta é a MESMA da tela —
 * `fn_can_view_conversation` —, feita como a pessoa, dentro de uma transação
 * desfeita. Aqui se mede a consulta exata de `lib/agendadas/executar.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 3 });

const ORG = "a9a9a9a9-0000-4000-8000-000000000001";
const DONA = "a9a9a9a9-1111-4000-8000-000000000001";
const COLEGA = "a9a9a9a9-1111-4000-8000-000000000002";
const GERENTE = "a9a9a9a9-1111-4000-8000-000000000003";
const DE_FORA = "a9a9a9a9-1111-4000-8000-000000000004";
let conversa: string;

/** A mesma consulta de `aindaEnxerga` (lib/agendadas/executar.ts). */
async function aindaEnxerga(userId: string): Promise<boolean> {
  const cli = await pool.connect();
  try {
    await cli.query("begin");
    await cli.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    const { rows } = await cli.query(
      `select public.fn_can_view_conversation(cv.organization_id, cv.assigned_to_user_id, cv.is_private) as pode
         from conversations cv where cv.organization_id = $1 and cv.id = $2`,
      [ORG, conversa],
    );
    return rows[0]?.pode === true;
  } finally {
    await cli.query("rollback");
    cli.release();
  }
}

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'agendada-acesso', 'agendada-acesso', 'agendada-acesso', 'America/Sao_Paulo') on conflict (id) do nothing`,
    [ORG],
  );
  for (const [uid, role] of [[DONA, "agent"], [COLEGA, "agent"], [GERENTE, "manager"]] as const) {
    await pool.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@t.test`]);
    await pool.query(
      `insert into user_organizations (user_id, organization_id, role, accepted_at) values ($1, $2, $3, now()) on conflict do nothing`,
      [uid, ORG, role],
    );
  }
  await pool.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [DE_FORA, `${DE_FORA}@t.test`]);
  const canal = await pool.query(
    `insert into channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted) values ($1, 'agendada-acesso', '\\x00') returning id`,
    [ORG],
  );
  const contato = await pool.query(`insert into contacts (organization_id, name, phone_number) values ($1, 'C', '+5511999990001') returning id`, [ORG]);
  const c = await pool.query(
    `insert into conversations (organization_id, contact_id, channel_session_id, channel, status, assigned_to_user_id)
     values ($1, $2, $3, 'whatsapp', 'open', $4) returning id`,
    [ORG, contato.rows[0].id, canal.rows[0].id, DONA],
  );
  conversa = c.rows[0].id;
});
afterAll(() => pool.end());

describe("mensagem agendada reconfere o acesso de quem agendou", () => {
  it("quem agendou e ainda é responsável enxerga; gerente também; quem não é da empresa, não", async () => {
    expect(await aindaEnxerga(DONA)).toBe(true);
    expect(await aindaEnxerga(GERENTE)).toBe(true);
    expect(await aindaEnxerga(DE_FORA)).toBe(false);
  });

  it("a conversa passou para a colega e virou privada: quem agendou antes não envia mais", async () => {
    await pool.query(`update conversations set assigned_to_user_id = $2, is_private = true where id = $1`, [conversa, COLEGA]);
    expect(await aindaEnxerga(DONA)).toBe(false);
    expect(await aindaEnxerga(COLEGA)).toBe(true);
    expect(await aindaEnxerga(GERENTE)).toBe(true);
  });

  it("a pergunta não deixa a identidade para trás na conexão", async () => {
    const r = await pool.query(`select current_setting('request.jwt.claims', true) as c`);
    expect(r.rows[0].c ?? "").toBe("");
  });
});
