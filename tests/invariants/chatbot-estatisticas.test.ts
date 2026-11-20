/**
 * Estatística por bloco do chatbot (migration 0512), contra o Postgres real:
 *   - RLS: membro de uma organização lê só a dela (zero da vizinha); escrever
 *     direto como authenticated é negado — só o servidor soma;
 *   - a soma do worker (`concluirTurno`) incrementa na mesma linha do dia, e um
 *     turno real do chatbot grava por qual saída cada bloco seguiu.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(async () => ({ status: "sent" })),
}));
vi.mock("@/lib/billing", () => ({ getOrganizationBilling: vi.fn(async () => ({ ok: true, billing: null })) }));
vi.mock("@/lib/automation/janela-do-canal", () => ({ adiarAteAJanelaAbrir: vi.fn(async () => null) }));
vi.mock("@/lib/automation/throttle", () => ({ espacarEnvio: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));

import { atenderPeloChatbot } from "@/lib/chatbot/executar";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 3 });
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const admin = { rpc: async () => ({ error: null }) } as never;

const ORG_A = "e5e5e5e5-0000-4000-8000-000000000001";
const ORG_B = "e5e5e5e5-0000-4000-8000-000000000002";
const NUMERO = "e5e5e5e5-0000-4000-8000-000000000003";
const FLUXO_A = "e5e5e5e5-0000-4000-8000-000000000004";
const FLUXO_B = "e5e5e5e5-0000-4000-8000-000000000005";
const ANA = "e5e5e5e5-1111-4000-8000-000000000001"; // membro de A
const BIA = "e5e5e5e5-1111-4000-8000-000000000002"; // membro de B

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
const contar = (userId: string) =>
  comoUsuario(userId, async (c) =>
    Number((await c.query<{ n: string }>(`select count(*)::text as n from chatbot_estatisticas`)).rows[0]?.n),
  );

const grafo = {
  nodes: [
    { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    { id: "m", type: "enviar_mensagem", position: { x: 0, y: 0 }, data: { texto: "Olá!" } },
  ],
  edges: [{ id: "e", source: "i", target: "m", sourceHandle: "proximo" }],
};

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG_A, "estat-a"],
    [ORG_B, "estat-b"],
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
      `insert into user_organizations (user_id, organization_id, role, accepted_at) values ($1, $2, 'manager', now()) on conflict do nothing`,
      [uid, org],
    );
  }
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'estat-numero', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [NUMERO, ORG_A],
  );
  for (const [f, org] of [
    [FLUXO_A, ORG_A],
    [FLUXO_B, ORG_B],
  ])
    await pool.query(
      `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
       values ($1, $2, 'Estatística', 'active', $3, $4::jsonb) on conflict (id) do nothing`,
      [f, org, f === FLUXO_A, JSON.stringify(grafo)],
    );
  await pool.query(
    `insert into chatbot_estatisticas (organization_id, flow_id, node_id, saida, dia, contagem)
     values ($1, $2, 'x', 'proximo', current_date, 5)`,
    [ORG_B, FLUXO_B],
  );
});

afterAll(() => pool.end());

describe("chatbot_estatisticas — isolamento", () => {
  it("cada um lê só a própria organização", async () => {
    expect(await contar(BIA)).toBe(1);
    expect(await contar(ANA)).toBe(0);
  });

  it("authenticated não escreve (só o servidor soma)", async () => {
    const r = await comoUsuario(ANA, (c) =>
      c.query(
        `insert into chatbot_estatisticas (organization_id, flow_id, node_id, saida, dia, contagem)
         values ($1, $2, 'y', 'proximo', current_date, 1)`,
        [ORG_A, FLUXO_A],
      ),
    );
    expect(String(r)).toMatch(/permission denied/);
    const u = await comoUsuario(BIA, (c) => c.query(`update chatbot_estatisticas set contagem = 999`));
    expect(String(u)).toMatch(/permission denied/);
  });
});

describe("chatbot_estatisticas — a soma do turno", () => {
  async function turno() {
    const contato = crypto.randomUUID();
    const conversa = crypto.randomUUID();
    const msg = crypto.randomUUID();
    await pool.query(`insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'C', $3)`, [
      contato,
      ORG_A,
      `+55219${Math.floor(Math.random() * 1e8)}`,
    ]);
    await pool.query(
      `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
       values ($1, $2, $3, $4, 'open', false)`,
      [conversa, ORG_A, contato, NUMERO],
    );
    await pool.query(
      `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, body, sent_via, sent_at)
       values ($1, $2, $3, $4, $5, 'text', 'inbound', 'delivered', 'oi', 'external_device', now())`,
      [msg, ORG_A, conversa, NUMERO, contato],
    );
    await atenderPeloChatbot(
      pool,
      admin,
      { organizationId: ORG_A, conversationId: conversa, contactId: contato, channelSessionId: NUMERO, inboundMessageId: msg },
      log,
    );
  }
  const linhas = async () =>
    (
      await pool.query<{ node_id: string; saida: string; contagem: number }>(
        `select node_id, saida, contagem from chatbot_estatisticas where flow_id = $1 order by node_id`,
        [FLUXO_A],
      )
    ).rows;

  it("dois turnos somam na MESMA linha do dia, por bloco e saída", async () => {
    await turno();
    await turno();
    expect(await linhas()).toEqual([
      { node_id: "i", saida: "proximo", contagem: 2 },
      { node_id: "m", saida: "proximo", contagem: 2 },
    ]);
  });
});
