/**
 * Prova contra o banco real de duas peças do S5 que só tinham teste de unidade:
 *
 *   1. O passo "Atualizar o card" do follow-up (`atualizarCard`, em
 *      `lib/followup/engine.ts`): põe e tira etiquetas e move o negócio de
 *      etapa no MESMO funil; recusa etapa de outro funil sem mexer em nada.
 *   2. O cron "conversa sem resposta volta para a fila"
 *      (`app/api/v1/cron/conversa-sem-resposta`): a chamada que ele faz à
 *      `fn_conversation_assign` solta a conversa com motivo `release`, e a trava
 *      "só se o dono ainda é este" não mexe quando o dono mudou.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { routingPgSupabase } from "../support/routing-pg-supabase";
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { createSupabaseAdminClient } from "@/lib/followup/engine";
import {
  seedGov,
  GOV_ORG as org,
  GOV_AGENT_A as ana,
  GOV_AGENT_B as bruno,
  GOV_CONTACT_1 as contato,
  GOV_PIPELINE as funil,
  GOV_STAGE as etapaNova,
  GOV_LEAD as lead,
  GOV_CONV_AGENT_B as conversa,
} from "./gov-helpers";

const pool = new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
  max: 5,
});
const query = (text: string, args: unknown[] = []) => pool.query(text, args);

const ETAPA_DOIS = "cccccccc-5555-4000-8000-0000000000a2";
const OUTRO_FUNIL = "cccccccc-5555-4000-8000-0000000000b1";
const ETAPA_DE_OUTRO_FUNIL = "cccccccc-5555-4000-8000-0000000000b2";
const INSCRICAO = "cccccccc-7777-4000-8000-000000000001";

beforeAll(async () => {
  await seedGov();
  await query(
    `insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values($1,$2,$3,'Quente','quente',2000) on conflict do nothing`,
    [ETAPA_DOIS, org, funil],
  );
  await query(`insert into crm_pipelines(id,organization_id,name,slug) values($1,$2,'Outro','outro') on conflict do nothing`, [
    OUTRO_FUNIL,
    org,
  ]);
  await query(
    `insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values($1,$2,$3,'Fora','fora',1000) on conflict do nothing`,
    [ETAPA_DE_OUTRO_FUNIL, org, OUTRO_FUNIL],
  );
});
afterAll(() => pool.end());

describe("passo Atualizar o card", () => {
  beforeEach(async () => {
    await query("update crm_leads set contact_id=$1, stage_id=$2, tags=array['frio','vip'] where id=$3", [
      contato,
      etapaNova,
      lead,
    ]);
  });

  const atualizar = async (config: Record<string, unknown>) => {
    const adapter = routingPgSupabase(pool);
    // A ponte de teste serializa todo argumento de RPC como JSON; o PostgREST de
    // verdade converte a lista em `text[]`. Para esta função, a lista vai crua.
    const rpcOriginal = (adapter.client as unknown as { rpc: (n: string, a: Record<string, unknown>) => unknown }).rpc;
    (adapter.client as unknown as { rpc: unknown }).rpc = async (nome: string, args: Record<string, unknown>) => {
      if (nome !== "fn_lead_remover_etiquetas") return rpcOriginal(nome, args);
      try {
        const r = await pool.query("select fn_lead_remover_etiquetas(p_org=>$1, p_lead=>$2, p_etiquetas=>$3) r", [
          args.p_org,
          args.p_lead,
          args.p_etiquetas,
        ]);
        return { data: r.rows[0]?.r, error: null };
      } catch (error) {
        adapter.errors.push(error);
        return { data: null, error };
      }
    };
    const db = createSupabaseAdminClient(adapter.client);
    await db.atualizarCard!({
      organization_id: org,
      contact_id: contato,
      enrollment_id: INSCRICAO,
      config: { adicionar_etiquetas: [], remover_etiquetas: [], ...config } as never,
    });
    return adapter.errors;
  };
  const card = async () =>
    (await query("select stage_id, tags from crm_leads where id=$1", [lead])).rows[0] as {
      stage_id: string;
      tags: string[];
    };

  it("põe e tira etiquetas sem duplicar (caixa diferente conta como a mesma)", async () => {
    const erros = await atualizar({ adicionar_etiquetas: ["quente", "VIP"], remover_etiquetas: ["frio"] });
    expect(erros).toEqual([]);
    const c = await card();
    expect(c.tags.sort()).toEqual(["quente", "vip"]);
  });

  it("move de etapa dentro do mesmo funil", async () => {
    const erros = await atualizar({ etapa_id: ETAPA_DOIS });
    expect(erros).toEqual([]);
    expect((await card()).stage_id).toBe(ETAPA_DOIS);
  });

  it("etapa de outro funil não move nada", async () => {
    await atualizar({ etapa_id: ETAPA_DE_OUTRO_FUNIL });
    expect((await card()).stage_id).toBe(etapaNova);
  });
});

describe("conversa sem resposta volta para a fila — a chamada do cron", () => {
  beforeEach(async () => {
    await query(
      "update conversations set assigned_to_user_id=$1, assignee_kind='user', status='claimed', assigned_at=now()-interval '2 hours' where id=$2",
      [bruno, conversa],
    );
  });
  // A MESMA chamada, com os mesmos nomes de parâmetro, que a rota faz pelo PostgREST.
  const soltar = (esperado: string) =>
    query(
      "select * from fn_conversation_assign(p_organization_id=>$1, p_conversation_id=>$2, p_to_user_id=>null, p_reason=>'release', p_expected_assignee=>$3, p_enforce_expected=>true)",
      [org, conversa, esperado],
    );

  it("solta a conversa, volta para 'open' e grava o motivo release", async () => {
    const r = await soltar(bruno);
    expect(r.rows).toHaveLength(1);
    const c = (await query("select assigned_to_user_id, assignee_kind, status from conversations where id=$1", [conversa]))
      .rows[0];
    expect(c).toMatchObject({ assigned_to_user_id: null, assignee_kind: null, status: "open" });
    const ev = (
      await query(
        "select from_user_id, to_user_id, reason from conversation_assignment_events where conversation_id=$1 order by created_at desc limit 1",
        [conversa],
      )
    ).rows[0];
    expect(ev).toMatchObject({ from_user_id: bruno, to_user_id: null, reason: "release" });
  });

  it("se o dono mudou, não mexe (trava do dono esperado)", async () => {
    const r = await soltar(ana);
    expect(r.rows).toHaveLength(0);
    expect(
      (await query("select assigned_to_user_id from conversations where id=$1", [conversa])).rows[0].assigned_to_user_id,
    ).toBe(bruno);
  });

  it("depois de soltar, o pedido de roteamento entra na fila de eventos", async () => {
    await soltar(bruno);
    await query("delete from event_log where organization_id=$1 and entity_id=$2 and event_type='conversation.routing_requested'", [
      org,
      conversa,
    ]);
    await query("select fn_request_channel_routing(p_org=>$1, p_conversation=>$2)", [org, conversa]);
    const n = (
      await query(
        "select count(*)::int n from event_log where organization_id=$1 and entity_id=$2 and event_type='conversation.routing_requested'",
        [org, conversa],
      )
    ).rows[0].n;
    expect(n).toBe(1);
  });
});
