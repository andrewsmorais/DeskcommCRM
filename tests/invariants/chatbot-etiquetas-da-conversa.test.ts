/**
 * "Editar etiquetas" com alvo na CONVERSA e a condição "Campo do contato",
 * contra o Postgres real e o CÓDIGO REAL do executor:
 *   - na conversa: grava em `conversations.tags` (minúscula, sem repetir) e
 *     NÃO mexe em `contacts.tags`; o teto de 20 vale;
 *   - no contato: segue como antes (`contacts.tags`), sem tocar na conversa;
 *   - a condição "Etiquetas" enxerga a etiqueta que a conversa já tinha no banco;
 *   - "Campo do contato" lê o cadastro real do contato.
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

const ORG = "f7e7e7e7-0000-4000-8000-000000000001";
const NUMERO = "f7e7e7e7-0000-4000-8000-000000000002";
const FLUXO = "f7e7e7e7-0000-4000-8000-000000000003";
let seq = 0;
const id = (p: string) => `f7e7e7e7-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

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
     values ($1, $2, 'Etiquetas', 'active', true, $3::jsonb)
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
const etiquetas = async (c: { contato: string; conversa: string }) => {
  const contato = await pool.query<{ tags: string[] }>(`select tags from contacts where id = $1`, [c.contato]);
  const conversa = await pool.query<{ tags: string[] }>(`select tags from conversations where id = $1`, [
    c.conversa,
  ]);
  return { contato: contato.rows[0]!.tags, conversa: conversa.rows[0]!.tags };
};

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-etq-conversa', 'chatbot-etq-conversa', 'chatbot-etq-conversa', 'America/Sao_Paulo')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'etq-conversa-numero', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
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

describe("Editar etiquetas (executor)", () => {
  it("na conversa: grava em conversations.tags, normalizado, e não toca no contato", async () => {
    await fluxo(
      [
        no("i", "inicio_canal"),
        no("e", "editar_etiquetas", { alvo: "conversa", adicionar: ["Urgente", "urgente", "Retorno"], remover: ["velha"] }),
        no("m", "enviar_mensagem", { texto: "ok" }),
      ],
      [liga("i", "e"), liga("e", "m")],
    );
    const c = await conversaNova({ tagsDaConversa: ["velha", "fica"] });
    await chega(c);
    expect(await etiquetas(c)).toEqual({ contato: [], conversa: ["fica", "urgente", "retorno"] });
    expect(auditorias).toContainEqual({ action: "conversation.tags_changed", resourceId: c.conversa });
    expect(enviadas).toEqual(["ok"]);
  });

  it("no contato (e fluxo antigo sem alvo): grava em contacts.tags, não na conversa", async () => {
    await fluxo(
      [no("i", "inicio_canal"), no("e", "editar_etiquetas", { adicionar: ["VIP"] })],
      [liga("i", "e")],
    );
    const c = await conversaNova({ tagsDaConversa: ["fica"] });
    await chega(c);
    expect(await etiquetas(c)).toEqual({ contato: ["vip"], conversa: ["fica"] });
  });

  it("a conversa guarda até 20: o que passa não entra, e nada do que ela tinha se perde", async () => {
    const tinha = Array.from({ length: 19 }, (_, i) => `t${i}`);
    await fluxo(
      [no("i", "inicio_canal"), no("e", "editar_etiquetas", { alvo: "conversa", adicionar: ["nova1", "nova2"] })],
      [liga("i", "e")],
    );
    const c = await conversaNova({ tagsDaConversa: tinha });
    await chega(c);
    expect((await etiquetas(c)).conversa).toEqual([...tinha, "nova1"]);
  });
});

describe("Condições que leem o banco", () => {
  it('"Etiquetas" enxerga a etiqueta que a conversa já tinha', async () => {
    await fluxo(
      [
        no("i", "inicio_canal"),
        no("c", "tem_etiqueta", { etiquetas: ["retorno"] }),
        no("s", "enviar_mensagem", { texto: "tem" }),
        no("n", "enviar_mensagem", { texto: "não tem" }),
      ],
      [liga("i", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
    );
    await chega(await conversaNova({ tagsDaConversa: ["retorno"] }));
    await chega(await conversaNova());
    expect(enviadas).toEqual(["tem", "não tem"]);
  });

  it('"Campo do contato" lê o e-mail do cadastro', async () => {
    await fluxo(
      [
        no("i", "inicio_canal"),
        no("c", "condicao_campo_contato", { regra: { chave: "email", operador: "preenchido" } }),
        no("s", "enviar_mensagem", { texto: "já tem e-mail" }),
        no("n", "enviar_mensagem", { texto: "qual o seu e-mail?" }),
      ],
      [liga("i", "c"), liga("c", "s", "sim"), liga("c", "n", "nao")],
    );
    await chega(await conversaNova({ email: "ana@exemplo.com" }));
    await chega(await conversaNova());
    expect(enviadas).toEqual(["já tem e-mail", "qual o seu e-mail?"]);
  });
});
