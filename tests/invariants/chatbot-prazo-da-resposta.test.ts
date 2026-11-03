/**
 * "Cliente não respondeu" (prazo da pergunta), contra o Postgres real e o
 * CÓDIGO REAL do executor:
 *   - pergunta com prazo grava a sessão com relógio (token + evento agendado
 *     no `event_log`), não timer em memória;
 *   - o relógio vencido segue por "Não respondeu a tempo" e a mensagem sai;
 *   - a resposta que chega ANTES troca o token: o relógio velho, quando
 *     acorda, é descartado e nada sai em dobro.
 *
 * Fora: envio ao WhatsApp (espião), plano e janela (dublês).
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
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));

import {
  atenderPeloChatbot,
  retomarChatbotPeloRelogio,
  type PedidoDeRetomada,
} from "@/lib/chatbot/executar";

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

const ORG = "f4f4f4f4-0000-4000-8000-000000000001";
const NUMERO = "f4f4f4f4-0000-4000-8000-000000000002";
const FLUXO = "f4f4f4f4-0000-4000-8000-000000000003";
let seq = 0;
const id = (p: string) => `f4f4f4f4-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

async function conversaNova() {
  const contato = id("2222");
  const conversa = id("3333");
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'Cliente', $3)`,
    [contato, ORG, `+55319${String(seq).padStart(8, "0")}`],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'open', false)`,
    [conversa, ORG, contato, NUMERO],
  );
  return { contato, conversa };
}

async function chega(c: { contato: string; conversa: string }, body: string) {
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

/** O pedido de retomada que o executor agendou para a sessão desta conversa. */
async function relogioDa(conversa: string): Promise<{ pedido: PedidoDeRetomada; quando: Date }> {
  const { rows } = await pool.query<{ payload: PedidoDeRetomada; next_attempt_at: Date }>(
    `select payload, next_attempt_at from event_log
      where organization_id = $1 and event_type = 'chatbot.retomada_requested'
        and payload->>'conversation_id' = $2
      order by created_at desc limit 1`,
    [ORG, conversa],
  );
  expect(rows[0]).toBeDefined();
  return { pedido: rows[0]!.payload, quando: new Date(rows[0]!.next_attempt_at) };
}

/** Faz o prazo vencer agora (o relógio da sessão), sem esperar 5 minutos. */
const vencer = (sessao: string) =>
  pool.query(`update chatbot_sessions set retomar_em = now() - interval '1 minute' where id = $1`, [
    sessao,
  ]);

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-prazo', 'chatbot-prazo', 'chatbot-prazo', 'America/Sao_Paulo') on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'prazo-numero', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [NUMERO, ORG],
  );
  const grafo = {
    nodes: [
      { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
      {
        id: "p",
        type: "pedir_digitar",
        position: { x: 0, y: 0 },
        data: { pergunta: "Qual o seu nome?", variavel: "nome", prazo_minutos: 5 },
      },
      {
        id: "ok",
        type: "enviar_mensagem",
        position: { x: 0, y: 0 },
        data: { texto: "Obrigado, {{nome}}!" },
      },
      {
        id: "sem",
        type: "enviar_mensagem",
        position: { x: 0, y: 0 },
        data: { texto: "Ainda está aí?" },
      },
    ],
    edges: [
      { id: "a", source: "i", target: "p", sourceHandle: "proximo" },
      { id: "b", source: "p", target: "ok", sourceHandle: "proximo" },
      { id: "c", source: "p", target: "sem", sourceHandle: "sem_resposta" },
    ],
  };
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, 'Prazo', 'active', true, $3::jsonb)
     on conflict (id) do update set grafo = excluded.grafo, is_active = true`,
    [FLUXO, ORG, JSON.stringify(grafo)],
  );
});

beforeEach(() => {
  enviadas.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("prazo da pergunta", () => {
  it("pergunta com prazo agenda o relógio no event_log, para daqui a 5 minutos", async () => {
    const c = await conversaNova();
    const antes = Date.now();
    await chega(c, "oi");
    expect(enviadas).toEqual(["Qual o seu nome?"]);
    const { pedido, quando } = await relogioDa(c.conversa);
    expect(quando.getTime()).toBeGreaterThanOrEqual(antes + 4 * 60_000);
    const { rows } = await pool.query(
      `select status, retomada_token::text as token from chatbot_sessions where id = $1`,
      [pedido.session_id],
    );
    expect(rows[0]).toMatchObject({ status: "waiting_input", token: pedido.token });
  });

  it("relógio vencido sem resposta: segue por Não respondeu a tempo", async () => {
    const c = await conversaNova();
    await chega(c, "oi");
    const { pedido } = await relogioDa(c.conversa);
    await vencer(pedido.session_id);
    enviadas.length = 0;
    expect(await retomarChatbotPeloRelogio(pool, admin, pedido, ORG, log)).toBe("retomou");
    expect(enviadas).toEqual(["Ainda está aí?"]);
  });

  it("resposta antes do prazo: segue normal, e o relógio velho é descartado", async () => {
    const c = await conversaNova();
    await chega(c, "oi");
    const { pedido } = await relogioDa(c.conversa);
    await chega(c, "Ana");
    expect(enviadas).toEqual(["Qual o seu nome?", "Obrigado, Ana!"]);
    enviadas.length = 0;
    await vencer(pedido.session_id);
    expect(await retomarChatbotPeloRelogio(pool, admin, pedido, ORG, log)).toBe("descartado");
    expect(enviadas).toEqual([]);
  });

  it("relógio adiantado (antes da hora) não age: pede para adiar", async () => {
    const c = await conversaNova();
    await chega(c, "oi");
    const { pedido } = await relogioDa(c.conversa);
    const r = await retomarChatbotPeloRelogio(pool, admin, pedido, ORG, log);
    expect(typeof r === "object" && "adiarAte" in r).toBe(true);
  });
});
