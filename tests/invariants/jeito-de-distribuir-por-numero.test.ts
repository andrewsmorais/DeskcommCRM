/**
 * 0559 — Cada número com seu jeito de distribuir.
 *
 * Prova, contra o banco real (baseline aplicado):
 *   - a coluna aceita só os modos conhecidos (e NULL = segue a organização);
 *   - só gerente para cima grava, pela função, e só no número da própria org;
 *   - o worker usa o modo do NÚMERO antes do da organização, nos dois sentidos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRoutingWorker } from "@/lib/routing/worker";
import { routingPgSupabase } from "../support/routing-pg-supabase";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import {
  seedGov,
  GOV_ORG as org,
  GOV_AGENT_A as ana,
  GOV_MANAGER as manager,
  GOV_SESSION as channel,
  GOV_CONV_UNASSIGNED as conv,
} from "./gov-helpers";

const pool = new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
  max: 5,
});
const query = (text: string, args: unknown[] = []) => pool.query(text, args);
async function asUser(user: string, text: string, args: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, aal: "aal1" })]);
    const r = await c.query(text, args);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const definir = (user: string, mode: string | null, canal = channel) =>
  asUser(user, "select fn_set_channel_distribution_mode($1,$2,$3) r", [org, canal, mode]);

async function rodarWorker() {
  await query("delete from event_log where organization_id=$1 and event_type='conversation.routing_requested'", [org]);
  await query("select fn_request_channel_routing($1,$2)", [org, conv]);
  await query(
    "update event_log set next_attempt_at=null where organization_id=$1 and entity_id=$2 and event_type='conversation.routing_requested'",
    [org, conv],
  );
  const adapter = routingPgSupabase(pool);
  vi.mocked(createAdminClient).mockReturnValue(adapter.client as never);
  const r = await runRoutingWorker({ now: new Date() });
  expect(adapter.errors).toEqual([]);
  return r;
}
const dono = async () =>
  (await query("select assigned_to_user_id from conversations where organization_id=$1 and id=$2", [org, conv])).rows[0]
    ?.assigned_to_user_id ?? null;

beforeAll(() => seedGov());
afterAll(() => pool.end());
beforeEach(async () => {
  await query("update channel_sessions set routing_mode=null where organization_id=$1", [org]);
  await query("delete from channel_routing_policies where organization_id=$1", [org]);
  await query(
    "update conversations set assigned_to_user_id=null,assignee_kind=null,status='open',last_handoff_at=null,bot_silenced_until=null where organization_id=$1",
    [org],
  );
  await query(
    "insert into attendant_availability(organization_id,user_id,is_available,capacity,schedule) values($1,$2,true,5,'{}') on conflict(organization_id,user_id) do update set is_available=true,capacity=5,schedule='{}'",
    [org, ana],
  );
});

describe("coluna e função", () => {
  it("a coluna recusa modo desconhecido e aceita NULL", async () => {
    await expect(
      query("update channel_sessions set routing_mode='sorteio' where organization_id=$1 and id=$2", [org, channel]),
    ).rejects.toThrow(/channel_sessions_routing_mode_check/);
    await query("update channel_sessions set routing_mode=null where organization_id=$1 and id=$2", [org, channel]);
  });

  it("gerente grava e volta para o padrão; atendente é recusado", async () => {
    const r = await definir(manager, "least_load");
    expect(r.rows[0].r).toMatchObject({ channel_session_id: channel, routing_mode: "least_load" });
    expect(
      (await query("select routing_mode from channel_sessions where id=$1", [channel])).rows[0].routing_mode,
    ).toBe("least_load");
    await definir(manager, null);
    expect((await query("select routing_mode from channel_sessions where id=$1", [channel])).rows[0].routing_mode).toBeNull();
    await expect(definir(ana, "round_robin")).rejects.toMatchObject({ code: "42501" });
  });

  it("modo inválido e número de fora da organização são recusados", async () => {
    await expect(definir(manager, "sorteio")).rejects.toMatchObject({ code: "22023" });
    await expect(definir(manager, "manual", "00000000-0000-4000-8000-0000000000ff")).rejects.toMatchObject({
      code: "P0002",
    });
  });

  it("anon não alcança a função", async () => {
    const r = await query(
      "select has_function_privilege('anon','public.fn_set_channel_distribution_mode(uuid,uuid,text)','execute') ok",
    );
    expect(r.rows[0].ok).toBe(false);
  });
});

describe("o worker obedece ao número", () => {
  it("organização manual, número em rodízio: a conversa ganha dono", async () => {
    await query("update organizations set settings=jsonb_set(coalesce(settings,'{}'),'{routing}','{\"mode\":\"manual\"}') where id=$1", [org]);
    await query("update channel_sessions set routing_mode='round_robin' where organization_id=$1 and id=$2", [org, channel]);
    const r = await rodarWorker();
    expect(r.outcomes.assigned ?? 0).toBe(1);
    expect(await dono()).not.toBeNull();
  });

  it("organização em rodízio, número manual: a conversa fica na fila", async () => {
    await query(
      "update organizations set settings=jsonb_set(coalesce(settings,'{}'),'{routing}','{\"mode\":\"round_robin\"}') where id=$1",
      [org],
    );
    await query("update channel_sessions set routing_mode='manual' where organization_id=$1 and id=$2", [org, channel]);
    const r = await rodarWorker();
    expect(r.outcomes.skipped_manual ?? 0).toBe(1);
    expect(await dono()).toBeNull();
  });
});
