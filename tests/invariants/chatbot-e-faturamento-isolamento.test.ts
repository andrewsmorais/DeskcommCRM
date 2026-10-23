/**
 * Isolamento entre organizações e papel de escrita — tabelas do Chatbot Builder
 * (0486/0489/0490) e do faturamento do ChatAI Online (0484/0487).
 *
 * Duas organizações reais, cada uma com usuário próprio, falando com o banco
 * como `authenticated` + JWT (o mesmo caminho do PostgREST com a anon key).
 * Cada caso tem o controle positivo ao lado: "lê 0 do vizinho" só prova algo
 * se "lê ≥1 do próprio" também passar.
 *
 *   - chatbot_flows: membro lê só a própria org; `viewer` e `agent` não
 *     escrevem; `manager` escreve (é o papel que a rota exige).
 *   - chatbot_sessions / chatbot_nodes / chatbot_edges: membro lê só a própria
 *     org; ninguém com JWT grava (quem grava é o motor no worker).
 *   - subscriptions: cada org lê só a própria assinatura; ninguém com JWT grava.
 *   - asaas_customers, org_aquisicao: server-only — `authenticated` não lê.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
  max: 4,
});

const ORG_A = "dddddddd-0000-4000-8000-00000000000a";
const ORG_B = "dddddddd-0000-4000-8000-00000000000b";
const MANAGER_A = "dddddddd-1111-4000-8000-00000000000a";
const VIEWER_A = "dddddddd-1111-4000-8000-0000000000a2";
const AGENT_A = "dddddddd-1111-4000-8000-0000000000a3";
const MANAGER_B = "dddddddd-1111-4000-8000-00000000000b";
const FLOW_A = "dddddddd-2222-4000-8000-00000000000a";
const FLOW_B = "dddddddd-2222-4000-8000-00000000000b";

async function como<T = Record<string, unknown>>(user: string, texto: string, args: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    const r = await c.query(texto, args);
    await c.query("commit");
    return r as unknown as { rows: T[]; rowCount: number };
  } catch (err) {
    await c.query("rollback");
    throw err;
  } finally {
    c.release();
  }
}

const contar = async (user: string, tabela: string, org: string) =>
  Number((await como<{ n: string }>(user, `select count(*)::text n from public.${tabela} where organization_id = $1`, [org])).rows[0]?.n);

beforeAll(async () => {
  const q = (t: string, a: unknown[] = []) => pool.query(t, a);
  for (const [id, email] of [
    [MANAGER_A, "chatbot-manager-a"],
    [VIEWER_A, "chatbot-viewer-a"],
    [AGENT_A, "chatbot-agent-a"],
    [MANAGER_B, "chatbot-manager-b"],
  ])
    await q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${email}@invariant.test`]);
  for (const [org, slug] of [
    [ORG_A, "chatbot-inv-a"],
    [ORG_B, "chatbot-inv-b"],
  ])
    await q(
      "insert into public.organizations (id, slug, legal_name, display_name) values ($1, $2, $3, $4) on conflict do nothing",
      [org, slug, slug, slug],
    );
  for (const [user, org, role] of [
    [MANAGER_A, ORG_A, "manager"],
    [VIEWER_A, ORG_A, "viewer"],
    [AGENT_A, ORG_A, "agent"],
    [MANAGER_B, ORG_B, "manager"],
  ])
    await q(
      "insert into public.user_organizations (user_id, organization_id, role, accepted_at) values ($1, $2, $3, now()) on conflict do nothing",
      [user, org, role],
    );

  for (const [flow, org] of [
    [FLOW_A, ORG_A],
    [FLOW_B, ORG_B],
  ]) {
    await q(
      "insert into public.chatbot_flows (id, organization_id, name) values ($1, $2, 'Fluxo invariante') on conflict do nothing",
      [flow, org],
    );
    const no1 = await q(
      "insert into public.chatbot_nodes (organization_id, flow_id, node_type) values ($1, $2, 'inicio_canal') returning id",
      [org, flow],
    );
    const no2 = await q(
      "insert into public.chatbot_nodes (organization_id, flow_id, node_type) values ($1, $2, 'enviar_mensagem') returning id",
      [org, flow],
    );
    await q(
      "insert into public.chatbot_edges (organization_id, flow_id, source_node_id, target_node_id) values ($1, $2, $3, $4)",
      [org, flow, no1.rows[0].id, no2.rows[0].id],
    );
    const contato = await q(
      "insert into public.contacts (organization_id, display_name) values ($1, 'Contato chatbot inv') returning id",
      [org],
    );
    const numero = await q(
      "insert into public.channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted) values ($1, $2, '\\x00'::bytea) returning id",
      [org, `chatbot-inv-${String(org).slice(-1)}`],
    );
    const conversa = await q(
      "insert into public.conversations (organization_id, contact_id, channel_session_id, status) values ($1, $2, $3, 'open') returning id",
      [org, contato.rows[0].id, numero.rows[0].id],
    );
    await q(
      "insert into public.chatbot_sessions (organization_id, flow_id, conversation_id, status, no_atual) values ($1, $2, $3, 'waiting_input', 'x') on conflict do nothing",
      [org, flow, conversa.rows[0].id],
    );
    await q(
      "insert into public.subscriptions (organization_id, status, plan_type, billing_cycle, seats) values ($1, 'trialing', 'essencial', 'monthly', 1) on conflict do nothing",
      [org],
    );
    await q(
      "insert into public.asaas_customers (organization_id, asaas_customer_id) values ($1, $2) on conflict do nothing",
      [org, `cus_inv_${String(org).slice(-1)}`],
    );
    await q("insert into public.org_aquisicao (organization_id) values ($1) on conflict do nothing", [org]);
  }
});

afterAll(() => pool.end());

describe("chatbot e faturamento: cada organização só enxerga o que é seu", () => {
  for (const tabela of ["chatbot_flows", "chatbot_sessions", "chatbot_nodes", "chatbot_edges", "subscriptions"]) {
    it(`${tabela}: lê ≥1 da própria org e 0 da outra, nos dois sentidos`, async () => {
      expect(await contar(MANAGER_A, tabela, ORG_A)).toBeGreaterThanOrEqual(1);
      expect(await contar(MANAGER_A, tabela, ORG_B)).toBe(0);
      expect(await contar(MANAGER_B, tabela, ORG_B)).toBeGreaterThanOrEqual(1);
      expect(await contar(MANAGER_B, tabela, ORG_A)).toBe(0);
    });
  }

  it("viewer também lê o fluxo da própria org (a lista da tela não quebra)", async () => {
    expect(await contar(VIEWER_A, "chatbot_flows", ORG_A)).toBeGreaterThanOrEqual(1);
  });

  for (const tabela of ["asaas_customers", "org_aquisicao"]) {
    it(`${tabela}: server-only — authenticated é barrado até na própria org`, async () => {
      await expect(contar(MANAGER_A, tabela, ORG_A)).rejects.toThrow(/permission denied/);
    });
  }
});

describe("chatbot_flows: escrever exige manager", () => {
  const renomear = (user: string, flow: string) =>
    como(user, "update public.chatbot_flows set name = 'mexido' where id = $1", [flow]).then((r) => r.rowCount);

  it("viewer e agent não alteram o fluxo da própria org", async () => {
    expect(await renomear(VIEWER_A, FLOW_A)).toBe(0);
    expect(await renomear(AGENT_A, FLOW_A)).toBe(0);
    await expect(
      como(AGENT_A, "insert into public.chatbot_flows (organization_id, name) values ($1, 'novo')", [ORG_A]),
    ).rejects.toThrow(/row-level security/);
  });

  it("manager altera o da própria org (controle positivo) e não o da outra", async () => {
    expect(await renomear(MANAGER_A, FLOW_A)).toBe(1);
    expect(await renomear(MANAGER_A, FLOW_B)).toBe(0);
  });
});

describe("estado do motor e assinatura: ninguém com JWT grava", () => {
  for (const tabela of ["chatbot_sessions", "chatbot_nodes", "chatbot_edges"]) {
    it(`${tabela}: manager não altera nem apaga`, async () => {
      await expect(como(MANAGER_A, `update public.${tabela} set organization_id = organization_id`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(como(MANAGER_A, `delete from public.${tabela}`)).rejects.toThrow(/permission denied/);
    });
  }

  it("subscriptions: manager não se dá um plano melhor", async () => {
    await expect(
      como(MANAGER_A, "update public.subscriptions set plan_type = 'escala' where organization_id = $1", [ORG_A]),
    ).rejects.toThrow(/permission denied/);
  });
});
