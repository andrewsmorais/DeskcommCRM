/**
 * Chat no site (migration 0518), contra o Postgres real: o vocabulário novo
 * entra nas três constraints, o provider exige a chave pública, a chave é
 * única entre os canais vivos, e a conversa aceita o canal `webchat`.
 *
 * A entrada do visitante de ponta a ponta (rota pública → contato, conversa,
 * mensagem; um visitante não lê o outro) é medida com o app de pé em
 * `tests/seguranca/chat-no-site.spec.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 3 });

const ORG = "c5c5c5c5-0000-4000-8000-000000000001";
const CHAVE = "c5".repeat(16);
let canal: string;

async function erro(sql: string, params: unknown[]): Promise<{ code?: string; constraint?: string }> {
  try {
    await pool.query(sql, params);
    return {};
  } catch (e) {
    return e as { code?: string; constraint?: string };
  }
}

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chat-no-site', 'chat-no-site', 'chat-no-site', 'America/Sao_Paulo') on conflict (id) do nothing`,
    [ORG],
  );
  const r = await pool.query(
    `insert into channel_sessions (organization_id, provider, webchat_key, webhook_secret_encrypted, status, display_name)
     values ($1, 'webchat', $2, '\\x00', 'WORKING', 'Site') returning id`,
    [ORG, CHAVE],
  );
  canal = r.rows[0].id;
});
afterAll(() => pool.end());

describe("chat no site — vocabulário no banco", () => {
  it("provider webchat sem chave é recusado", async () => {
    const e = await erro(
      `insert into channel_sessions (organization_id, provider, webhook_secret_encrypted) values ($1, 'webchat', '\\x00')`,
      [ORG],
    );
    expect(e.constraint).toBe("channel_sessions_provider_ref_check");
  });

  it("a chave pública não se repete entre canais vivos, e volta a valer depois de arquivar", async () => {
    const sql = `insert into channel_sessions (organization_id, provider, webchat_key, webhook_secret_encrypted) values ($1, 'webchat', $2, '\\x00')`;
    expect((await erro(sql, [ORG, CHAVE])).code).toBe("23505");
    const outra = "d6".repeat(16);
    await pool.query(sql, [ORG, outra]);
    await pool.query(`update channel_sessions set archived_at = now() where webchat_key = $1`, [outra]);
    expect((await erro(sql, [ORG, outra])).code).toBeUndefined();
  });

  it("a conversa do visitante nasce pela mesma RPC e aceita o canal webchat", async () => {
    const c = await pool.query(
      `insert into contacts (organization_id, name, source, social_identity) values ($1, 'Visitante', 'webchat', $2) returning id`,
      [ORG, `webchat:${canal}:${"a".repeat(64)}`],
    );
    const conv = await pool.query(`select public.fn_upsert_wa_conversation($1, $2, $3) as id`, [ORG, c.rows[0].id, canal]);
    await pool.query(`update conversations set channel = 'webchat', provider_conversation_id = $2 where id = $1`, [
      conv.rows[0].id,
      `webchat:${canal}:${"a".repeat(64)}`,
    ]);
    const lida = await pool.query(`select channel from conversations where id = $1`, [conv.rows[0].id]);
    expect(lida.rows[0].channel).toBe("webchat");
    // Canal desconhecido segue recusado: a constraint foi ampliada, não removida.
    const e = await erro(`update conversations set channel = 'telegrama' where id = $1`, [conv.rows[0].id]);
    expect(e.constraint).toBe("conversations_channel_check");
  });
});
