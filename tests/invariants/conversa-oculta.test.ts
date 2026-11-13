/**
 * Conversa oculta (migration 0510), contra o Postgres real e o CÓDIGO REAL do
 * executor:
 *   - a coluna nasce `visivel` e o CHECK recusa valor fora da régua;
 *   - "oculta até a próxima mensagem" volta a `visivel` quando o CONTATO
 *     escreve (gatilho), e não quando a empresa escreve;
 *   - "oculta" (sem prazo) continua oculta com mensagem nova;
 *   - o passo "Visibilidade da conversa" do chatbot grava e audita.
 *
 * Fora: envio ao WhatsApp (espião), plano, janela.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";

const enviadas: string[] = [];
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(async (_admin: unknown, _ctx: unknown, input: { body?: string }) => {
    enviadas.push(input.body ?? "");
    return { status: "sent" };
  }),
}));
vi.mock("@/lib/billing", () => ({
  getOrganizationBilling: vi.fn(async () => ({ ok: true, billing: null })),
}));
vi.mock("@/lib/automation/janela-do-canal", () => ({
  adiarAteAJanelaAbrir: vi.fn(async () => null),
}));
vi.mock("@/lib/automation/throttle", () => ({ espacarEnvio: vi.fn(async () => undefined) }));
const auditorias: { action: string; resourceId: string | null }[] = [];
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async (a: { action: string; resourceId: string | null }) => {
    auditorias.push({ action: a.action, resourceId: a.resourceId });
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));

import { atenderPeloChatbot } from "@/lib/chatbot/executar";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)",
  );
}
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const admin = { rpc: async () => ({ error: null }) } as never;

const ORG = "f8e8e8e8-0000-4000-8000-000000000001";
const NUMERO = "f8e8e8e8-0000-4000-8000-000000000002";
const FLUXO = "f8e8e8e8-0000-4000-8000-000000000003";
let seq = 0;
const id = (p: string) => `f8e8e8e8-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

async function conversaNova(opcoes: { tagsDaConversa?: string[]; email?: string | null } = {}) {
  const contato = id("2222");
  const conversa = id("3333");
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number, email, tags)
     values ($1, $2, 'Cliente', $3, $4, '{}')`,
    [contato, ORG, `+55418${String(seq).padStart(8, "0")}`, opcoes.email ?? null],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group, tags)
     values ($1, $2, $3, $4, 'open', false, $5)`,
    [conversa, ORG, contato, NUMERO, opcoes.tagsDaConversa ?? []],
  );
  return { contato, conversa };
}

async function chega(c: { contato: string; conversa: string }, body = "oi") {
  const mid = id("4444");
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, body, sent_via, sent_at)
     values ($1, $2, $3, $4, $5, 'text', 'inbound', 'delivered', $6, 'external_device', now())`,
    [mid, ORG, c.conversa, NUMERO, c.contato, body],
  );
  await pool.query(`update conversations set last_inbound_at = now() where id = $1`, [c.conversa]);
  return atenderPeloChatbot(
    pool,
    admin,
    {
      organizationId: ORG,
      conversationId: c.conversa,
      contactId: c.contato,
      channelSessionId: NUMERO,
      inboundMessageId: mid,
    },
    log,
  );
}

async function fluxo(nodes: unknown[], edges: unknown[]) {
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, 'Visibilidade', 'active', true, $3::jsonb)
     on conflict (id) do update set grafo = excluded.grafo, is_active = true`,
    [FLUXO, ORG, JSON.stringify({ nodes, edges })],
  );
}
const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle = "proximo") => ({
  id: `${source}-${sourceHandle}`,
  source,
  target,
  sourceHandle,
});

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'conversa-oculta', 'conversa-oculta', 'conversa-oculta', 'America/Sao_Paulo')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'conversa-oculta-numero', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [NUMERO, ORG],
  );
});

beforeEach(() => {
  enviadas.length = 0;
  auditorias.length = 0;
});

afterAll(async () => {
  await pool.end();
});

const visibilidade = async (conversa: string) =>
  (
    await pool.query<{ visibilidade: string }>(
      `select visibilidade from conversations where id = $1`,
      [conversa],
    )
  ).rows[0]!.visibilidade;

async function mensagem(c: { contato: string; conversa: string }, direcao: "inbound" | "outbound") {
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, body, sent_via, sent_at)
     values ($1, $2, $3, $4, $5, 'text', $6, 'delivered', 'oi', $7, now())`,
    [id("5555"), ORG, c.conversa, NUMERO, c.contato, direcao, direcao === "inbound" ? "external_device" : "user"],
  );
}

describe("conversations.visibilidade", () => {
  it("nasce visível e recusa valor fora da régua", async () => {
    const c = await conversaNova();
    expect(await visibilidade(c.conversa)).toBe("visivel");
    await expect(
      pool.query(`update conversations set visibilidade = 'sumida' where id = $1`, [c.conversa]),
    ).rejects.toThrow(/conversations_visibilidade_check/);
  });

  it("oculta até a próxima mensagem: volta quando o CONTATO escreve, não quando a empresa escreve", async () => {
    const c = await conversaNova();
    await pool.query(`update conversations set visibilidade = 'oculta_ate_mensagem' where id = $1`, [
      c.conversa,
    ]);
    await mensagem(c, "outbound");
    expect(await visibilidade(c.conversa)).toBe("oculta_ate_mensagem");
    await mensagem(c, "inbound");
    expect(await visibilidade(c.conversa)).toBe("visivel");
  });

  it("oculta sem prazo continua oculta com mensagem nova do contato", async () => {
    const c = await conversaNova();
    await pool.query(`update conversations set visibilidade = 'oculta' where id = $1`, [c.conversa]);
    await mensagem(c, "inbound");
    expect(await visibilidade(c.conversa)).toBe("oculta");
  });

  it("o gatilho só mexe na conversa da mensagem", async () => {
    const a = await conversaNova();
    const b = await conversaNova();
    for (const c of [a, b])
      await pool.query(`update conversations set visibilidade = 'oculta_ate_mensagem' where id = $1`, [
        c.conversa,
      ]);
    await mensagem(a, "inbound");
    expect(await visibilidade(a.conversa)).toBe("visivel");
    expect(await visibilidade(b.conversa)).toBe("oculta_ate_mensagem");
  });
});

describe('passo "Visibilidade da conversa" (executor)', () => {
  it("oculta a conversa e audita; repetir não audita de novo", async () => {
    await fluxo(
      [
        no("i", "inicio_canal"),
        no("v", "visibilidade_conversa", { visibilidade: "oculta" }),
        no("m", "enviar_mensagem", { texto: "ok" }),
      ],
      [liga("i", "v"), liga("v", "m")],
    );
    const c = await conversaNova();
    await chega(c);
    expect(await visibilidade(c.conversa)).toBe("oculta");
    expect(auditorias).toContainEqual({ action: "conversation.visibility_changed", resourceId: c.conversa });
    expect(enviadas).toEqual(["ok"]);
  });
});
