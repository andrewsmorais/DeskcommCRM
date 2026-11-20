/**
 * Mensagens agendadas (migration 0511), contra o Postgres real e o CÓDIGO REAL
 * do worker (`lib/agendadas/executar.ts` pelo dreno `drenarComandosDoChatbot`):
 *
 *   - pelo login, ninguém escreve na tabela (só o servidor); lê quem enxerga a
 *     conversa — a outra organização e a conversa privada de outro atendente não;
 *   - no horário, a mensagem sai UMA vez, em nome de quem agendou; o evento
 *     repetido não manda de novo, e o envio interrompido vira "não saiu" sem
 *     reenviar;
 *   - nota vira nota da equipe; chatbot vira o mesmo pedido do botão do robô;
 *   - quem agendou e saiu da equipe, ou o contato bloqueado: não sai, e a
 *     conversa ganha nota dizendo por quê;
 *   - horário mudado para depois: o evento antigo não envia antes da hora;
 *   - anonimizar o contato (LGPD) apaga as agendadas dele.
 *
 * Fora: o WhatsApp de verdade (espião no lugar do envio) e a fronteira do
 * atendimento do chatbot (dublê que devolve uma fronteira válida).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";

type Envio = { actor: { type: string; id: string }; body?: string; conversation_id: string };
const envios: Envio[] = [];
let respostaDoEnvio: { status: string; error_message?: string } = { status: "sent" };
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(
    async (_admin: unknown, ctx: { actor: Envio["actor"] }, input: { body?: string; conversation_id: string }) => {
      envios.push({ actor: ctx.actor, body: input.body, conversation_id: input.conversation_id });
      return respostaDoEnvio;
    },
  ),
}));
vi.mock("@/lib/atendimento/origem", () => ({
  beginServiceAtOrigin: vi.fn(async (_admin: unknown, org: string, contact: string, session: string) => ({
    organization_id: org,
    contact_id: contact,
    conversation_id: conversaDoChatbot,
    channel_session_id: session,
    service_revision: 1,
  })),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/billing", () => ({
  getOrganizationBilling: vi.fn(async () => ({ ok: true, billing: null })),
}));

import { drenarComandosDoChatbot } from "@/lib/agent-engine/edge/crm/drain";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
}
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };

const ORG = "f9a9a9a9-0000-4000-8000-000000000001";
const OUTRA_ORG = "f9a9a9a9-0000-4000-8000-000000000002";
const NUMERO = "f9a9a9a9-0000-4000-8000-000000000003";
const AGENTE = "f9a9a9a9-1111-4000-8000-000000000001";
const OUTRO_AGENTE = "f9a9a9a9-1111-4000-8000-000000000002";
const DE_FORA = "f9a9a9a9-1111-4000-8000-000000000003";
const FLUXO = "f9a9a9a9-2222-4000-8000-000000000001";
let seq = 0;
const id = (p: string) => `f9a9a9a9-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;
let conversaDoChatbot = "";

async function conversaNova(opcoes: { privadaDe?: string } = {}) {
  const contato = id("3333");
  const conversa = id("4444");
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'Cliente', $3)`,
    [contato, ORG, `+55417${String(seq).padStart(8, "0")}`],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group,
                                assigned_to_user_id, is_private)
     values ($1, $2, $3, $4, 'open', false, $5, $6)`,
    [conversa, ORG, contato, NUMERO, opcoes.privadaDe ?? null, Boolean(opcoes.privadaDe)],
  );
  return { contato, conversa };
}

/** Grava a agendada e o evento, como a rota faz (service role). */
async function agendar(
  c: { contato: string; conversa: string },
  dados: { tipo: "mensagem" | "nota" | "chatbot"; texto?: string; fluxo?: string; quando?: string; por?: string },
) {
  const agendada = id("5555");
  const quando = dados.quando ?? new Date(Date.now() - 1000).toISOString();
  await pool.query(
    `insert into mensagens_agendadas (id, organization_id, conversation_id, contact_id, tipo, texto,
                                      chatbot_flow_id, enviar_em, criado_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [agendada, ORG, c.conversa, c.contato, dados.tipo, dados.texto ?? null, dados.fluxo ?? null, quando, dados.por ?? AGENTE],
  );
  await pool.query(
    `insert into event_log (organization_id, event_type, entity_kind, entity_id, payload, next_attempt_at)
     values ($1, 'mensagem_agendada.envio_requested', 'mensagem_agendada', $2, $3::jsonb, $4)`,
    [ORG, agendada, JSON.stringify({ agendada_id: agendada }), quando],
  );
  return agendada;
}

const linha = async (agendada: string) =>
  (
    await pool.query<{ status: string; erro: string | null; enviado_em: string | null }>(
      `select status, erro, enviado_em from mensagens_agendadas where id = $1`,
      [agendada],
    )
  ).rows[0];
const notas = async (conversa: string) =>
  (
    await pool.query<{ body: string; created_by_name: string | null }>(
      `select body, created_by_name from conversation_notes where conversation_id = $1 order by created_at`,
      [conversa],
    )
  ).rows;

/** Lê como um membro logado (o caminho do navegador). */
async function contaComo(userId: string, consulta: string, params: unknown[] = []): Promise<number> {
  const cli = await pool.connect();
  try {
    await cli.query("begin");
    await cli.query("set local role authenticated");
    await cli.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
    const { rows } = await cli.query<{ n: string }>(consulta, params);
    return Number(rows[0]?.n ?? 0);
  } finally {
    await cli.query("rollback");
    cli.release();
  }
}
async function escreveComo(userId: string, dml: string, params: unknown[] = []): Promise<string> {
  const cli = await pool.connect();
  try {
    await cli.query("begin");
    await cli.query("set local role authenticated");
    await cli.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
    await cli.query(dml, params);
    return "passou";
  } catch (err) {
    return (err as Error).message;
  } finally {
    await cli.query("rollback");
    cli.release();
  }
}

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG, "agendadas"],
    [OUTRA_ORG, "agendadas-outra"],
  ])
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name, timezone)
       values ($1, $2, $3, $4, 'America/Sao_Paulo') on conflict (id) do nothing`,
      [org, slug, slug, slug],
    );
  for (const [u, nome] of [
    [AGENTE, "Ana Atendente"],
    [OUTRO_AGENTE, "Bruno"],
    [DE_FORA, "Carla"],
  ])
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb) on conflict do nothing`,
      [u, `${u}@agendadas.test`, JSON.stringify({ full_name: nome })],
    );
  for (const [u, org] of [
    [AGENTE, ORG],
    [OUTRO_AGENTE, ORG],
    [DE_FORA, OUTRA_ORG],
  ])
    await pool.query(
      `insert into user_organizations (user_id, organization_id, role, accepted_at)
       values ($1, $2, 'agent', now()) on conflict do nothing`,
      [u, org],
    );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'agendadas-numero', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [NUMERO, ORG],
  );
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, 'Pesquisa', 'active', true, $3::jsonb) on conflict (id) do nothing`,
    [
      FLUXO,
      ORG,
      JSON.stringify({
        nodes: [
          { id: "m", type: "inicio_manual", position: { x: 0, y: 0 }, data: { titulo: "Pesquisa" } },
          { id: "e", type: "enviar_mensagem", position: { x: 0, y: 0 }, data: { texto: "Nota de 1 a 5?" } },
        ],
        edges: [{ id: "a", source: "m", target: "e", sourceHandle: "proximo" }],
      }),
    ],
  );
});

beforeEach(() => {
  envios.length = 0;
  respostaDoEnvio = { status: "sent" };
});

afterAll(async () => {
  await pool.end();
});

describe("quem lê e quem escreve", () => {
  it("pelo login ninguém grava, muda nem apaga agendada — só o servidor", async () => {
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "nota", texto: "lembrar", quando: new Date(Date.now() + 3600e3).toISOString() });
    expect(
      await escreveComo(
        AGENTE,
        `insert into mensagens_agendadas (organization_id, conversation_id, contact_id, tipo, texto, enviar_em, criado_por)
         values ($1, $2, $3, 'nota', 'x', now() + interval '1 hour', $4)`,
        [ORG, c.conversa, c.contato, AGENTE],
      ),
    ).toMatch(/permission denied/);
    expect(await escreveComo(AGENTE, `update mensagens_agendadas set texto = 'y' where id = $1`, [a])).toMatch(
      /permission denied/,
    );
    expect(await escreveComo(AGENTE, `delete from mensagens_agendadas where id = $1`, [a])).toMatch(
      /permission denied/,
    );
  });

  it("lê quem enxerga a conversa; outra organização e conversa privada de outro atendente, não", async () => {
    const aberta = await conversaNova();
    const privada = await conversaNova({ privadaDe: OUTRO_AGENTE });
    const futuro = new Date(Date.now() + 3600e3).toISOString();
    const a1 = await agendar(aberta, { tipo: "nota", texto: "aberta", quando: futuro });
    const a2 = await agendar(privada, { tipo: "nota", texto: "privada", quando: futuro });
    const q = `select count(*)::text as n from mensagens_agendadas where id = any($1::uuid[])`;
    expect(await contaComo(AGENTE, q, [[a1, a2]])).toBe(1);
    expect(await contaComo(OUTRO_AGENTE, q, [[a1, a2]])).toBe(2);
    expect(await contaComo(DE_FORA, q, [[a1, a2]])).toBe(0);
  });
});

describe("no horário (worker)", () => {
  it("mensagem sai UMA vez, em nome de quem agendou; o evento repetido não manda de novo", async () => {
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "mensagem", texto: "Bom dia! Seu pedido saiu." });
    await drenarComandosDoChatbot(pool, log as never);
    expect(envios).toEqual([
      { actor: expect.objectContaining({ type: "user", id: AGENTE }), body: "Bom dia! Seu pedido saiu.", conversation_id: c.conversa },
    ]);
    expect((await linha(a))?.status).toBe("enviada");

    // O mesmo pedido de novo (reentrega do barramento): nada sai.
    await pool.query(
      `insert into event_log (organization_id, event_type, entity_kind, entity_id, payload)
       values ($1, 'mensagem_agendada.envio_requested', 'mensagem_agendada', $2, $3::jsonb)`,
      [ORG, a, JSON.stringify({ agendada_id: a })],
    );
    await drenarComandosDoChatbot(pool, log as never);
    expect(envios).toHaveLength(1);
  });

  it("envio interrompido no meio vira 'não saiu', sem reenviar", async () => {
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "mensagem", texto: "oi" });
    await pool.query(`update mensagens_agendadas set status = 'processando' where id = $1`, [a]);
    await drenarComandosDoChatbot(pool, log as never);
    expect(envios).toEqual([]);
    expect((await linha(a))?.status).toBe("falhou");
    expect((await notas(c.conversa)).map((n) => n.body).join(" ")).toMatch(/não saiu/);
  });

  it("o WhatsApp recusando: 'não saiu', com o motivo, e nota para a equipe", async () => {
    respostaDoEnvio = { status: "failed", error_message: "Número fora do ar" };
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "mensagem", texto: "oi" });
    await drenarComandosDoChatbot(pool, log as never);
    expect(await linha(a)).toMatchObject({ status: "falhou", erro: "Número fora do ar" });
  });

  it("nota vira nota da equipe, com o nome de quem agendou", async () => {
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "nota", texto: "Ligar para confirmar a entrega" });
    await drenarComandosDoChatbot(pool, log as never);
    expect(envios).toEqual([]);
    expect(await notas(c.conversa)).toEqual([
      { body: "Ligar para confirmar a entrega", created_by_name: "Ana Atendente" },
    ]);
    expect((await linha(a))?.status).toBe("enviada");
  });

  it("chatbot vira o mesmo pedido do botão do robô (manual, em nome de quem agendou)", async () => {
    const c = await conversaNova();
    conversaDoChatbot = c.conversa;
    const a = await agendar(c, { tipo: "chatbot", fluxo: FLUXO });
    // Só o pedido da agendada: o pedido de chatbot gerado fica para a próxima
    // rodada do dreno (o lote já foi tomado).
    await drenarComandosDoChatbot(pool, log as never);
    const { rows } = await pool.query<{ payload: { flow_id: string; manual: boolean; iniciado_por: string } }>(
      `select payload from event_log
        where organization_id = $1 and event_type = 'chatbot.inicio_requested' and payload->>'conversation_id' = $2`,
      [ORG, c.conversa],
    );
    expect(rows.map((r) => r.payload)).toEqual([
      expect.objectContaining({ flow_id: FLUXO, manual: true, iniciado_por: AGENTE }),
    ]);
    expect((await linha(a))?.status).toBe("enviada");
  });

  it("quem agendou saiu da equipe: não sai, e a conversa diz por quê", async () => {
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "mensagem", texto: "oi", por: OUTRO_AGENTE });
    await pool.query(
      `update user_organizations set revoked_at = now() where user_id = $1 and organization_id = $2`,
      [OUTRO_AGENTE, ORG],
    );
    try {
      await drenarComandosDoChatbot(pool, log as never);
    } finally {
      await pool.query(
        `update user_organizations set revoked_at = null where user_id = $1 and organization_id = $2`,
        [OUTRO_AGENTE, ORG],
      );
    }
    expect(envios).toEqual([]);
    expect((await linha(a))?.status).toBe("falhou");
    expect((await notas(c.conversa))[0]?.body).toMatch(/não faz mais parte da equipe/);
  });

  it("contato bloqueado: não sai", async () => {
    const c = await conversaNova();
    await pool.query(`update contacts set is_blocked = true where id = $1`, [c.contato]);
    const a = await agendar(c, { tipo: "mensagem", texto: "oi" });
    await drenarComandosDoChatbot(pool, log as never);
    expect(envios).toEqual([]);
    expect((await linha(a))?.status).toBe("falhou");
  });

  it("horário mudado para depois: o evento antigo não envia antes da hora", async () => {
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "mensagem", texto: "oi" });
    await pool.query(`update mensagens_agendadas set enviar_em = now() + interval '1 day' where id = $1`, [a]);
    await drenarComandosDoChatbot(pool, log as never);
    expect(envios).toEqual([]);
    expect((await linha(a))?.status).toBe("agendada");
  });

  it("cancelada não sai", async () => {
    const c = await conversaNova();
    const a = await agendar(c, { tipo: "mensagem", texto: "oi" });
    await pool.query(`update mensagens_agendadas set status = 'cancelada' where id = $1`, [a]);
    await drenarComandosDoChatbot(pool, log as never);
    expect(envios).toEqual([]);
    expect((await linha(a))?.status).toBe("cancelada");
  });
});

describe("LGPD", () => {
  it("anonimizar o contato apaga as agendadas dele, e só as dele", async () => {
    const c1 = await conversaNova();
    const c2 = await conversaNova();
    const futuro = new Date(Date.now() + 3600e3).toISOString();
    const a1 = await agendar(c1, { tipo: "mensagem", texto: "dado pessoal", quando: futuro });
    const a2 = await agendar(c2, { tipo: "mensagem", texto: "outro", quando: futuro });
    // A anonimização de verdade (a mesma da rota de LGPD).
    await pool.query(`select fn_lgpd_cascade_redact_contact($1, $2, null)`, [ORG, c1.contato]);
    expect(await linha(a1)).toBeUndefined();
    expect((await linha(a2))?.status).toBe("agendada");
  });
});
