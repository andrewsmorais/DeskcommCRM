/**
 * Os blocos da Umbler que faltavam, contra o Postgres real, com o CÓDIGO REAL
 * do executor (lib/chatbot/executar.ts):
 *   - "Iniciar manualmente": o atendente aciona o fluxo na conversa DELE e o
 *     chatbot responde até o fluxo terminar — sem a marca manual, conversa com
 *     dono humano nunca é respondida;
 *   - "Bloquear contato": grava `is_blocked`, audita, deixa nota;
 *   - "Excluir contato": abre o pedido LGPD (um por contato) e o aviso na
 *     Central, sem apagar nada;
 *   - as condições da conversa leem o banco: canal, primeira conversa e
 *     "esperando resposta".
 *
 * Fora: envio ao WhatsApp (espião), plano, janela, auditoria e a gravação do
 * pedido LGPD (dublê — o caminho dela tem teste próprio).
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
const auditorias: { action: string }[] = [];
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async (a: { action: string }) => {
    auditorias.push(a);
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
const pedidosLgpd: Record<string, unknown>[] = [];
vi.mock("@/lib/lgpd/repository", () => ({
  createLgpdRequest: vi.fn(async (input: Record<string, unknown>) => {
    pedidosLgpd.push(input);
    return { id: "pedido", due_at: "2026-11-13T00:00:00Z" };
  }),
}));

import { atenderPeloChatbot, iniciarChatbotPorAutomacao } from "@/lib/chatbot/executar";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const admin = { rpc: async () => ({ error: null }) } as never;

const ORG = "efefefef-0000-4000-8000-000000000001";
const SESSION = "efefefef-0000-4000-8000-000000000003";
const OUTRO_NUMERO = "efefefef-0000-4000-8000-000000000004";
const ATENDENTE = "efefefef-0000-4000-8000-000000000005";
let seq = 0;
const id = (p: string) => `efefefef-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

const no = (nid: string, type: string, data: Record<string, unknown> = {}) => ({
  id: nid,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle = "proximo") => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  target,
  sourceHandle,
});

async function conversaNova(opcoes: { atendente?: string } = {}) {
  const contato = id("1111");
  const conversa = id("2222");
  await pool.query(`insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'Cliente', $3)`, [
    contato,
    ORG,
    `+55119${String(seq).padStart(8, "0")}`,
  ]);
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group,
                                assigned_to_user_id, assignee_kind)
     values ($1, $2, $3, $4, 'open', false, $5, $6)`,
    [conversa, ORG, contato, SESSION, opcoes.atendente ?? null, opcoes.atendente ? "user" : null],
  );
  return { contato, conversa };
}

async function chega(c: { contato: string; conversa: string }, body: string) {
  const mid = id("3333");
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, body, sent_via, sent_at)
     values ($1, $2, $3, $4, $5, 'text', 'inbound', 'delivered', $6, 'external_device', now())`,
    [mid, ORG, c.conversa, SESSION, c.contato, body],
  );
  await pool.query(`update conversations set last_inbound_at = now() where id = $1`, [c.conversa]);
  return atenderPeloChatbot(
    pool,
    admin,
    { organizationId: ORG, conversationId: c.conversa, contactId: c.contato, channelSessionId: SESSION, inboundMessageId: mid },
    log,
  );
}

async function fluxo(fid: string, grafo: unknown) {
  await pool.query(
    `update chatbot_flows set is_active = false where organization_id = $1 and grafo::text like '%inicio_canal%'`,
    [ORG],
  );
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, $3, 'active', true, $4::jsonb)
     on conflict (id) do update set grafo = excluded.grafo, is_active = true`,
    [fid, ORG, `Fluxo ${fid.slice(-4)}`, JSON.stringify(grafo)],
  );
}

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-umbler', 'chatbot-umbler', 'chatbot-umbler', 'America/Sao_Paulo') on conflict (id) do nothing`,
    [ORG],
  );
  for (const [sid, nome] of [
    [SESSION, "chatbot-umbler"],
    [OUTRO_NUMERO, "chatbot-umbler-2"],
  ]) {
    await pool.query(
      `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
       values ($1, $2, $3, 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
      [sid, ORG, nome],
    );
  }
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'atendente-umbler@exemplo.com') on conflict (id) do nothing`,
    [ATENDENTE],
  );
});
beforeEach(() => {
  enviadas.length = 0;
  auditorias.length = 0;
  pedidosLgpd.length = 0;
});
afterAll(() => pool.end());

describe("Iniciar manualmente", () => {
  const FLUXO = "efefefef-0000-4000-8000-0000000000a1";
  const desenho = {
    nodes: [
      no("m", "inicio_manual"),
      no("nota", "pedir_avaliacao", { pergunta: "De 1 a 5, como foi?" }),
      no("ok", "enviar_mensagem", { texto: "Obrigado! Nota {{avaliacao}}." }),
    ],
    edges: [liga("m", "nota"), liga("nota", "ok")],
  };

  it("o atendente aciona na conversa dele e o chatbot conduz até o fim", async () => {
    await fluxo(FLUXO, desenho);
    const c = await conversaNova({ atendente: ATENDENTE });
    const r = await iniciarChatbotPorAutomacao(
      pool,
      admin,
      {
        flow_id: FLUXO,
        contact_id: c.contato,
        conversation_id: c.conversa,
        channel_session_id: SESSION,
        boundary: {
          organization_id: ORG,
          contact_id: c.contato,
          conversation_id: c.conversa,
          service_revision: 0,
          demanda_id: null,
          demanda_revision: null,
        },
        variaveis: {},
        regra_id: null,
        manual: true,
        iniciado_por: ATENDENTE,
      },
      ORG,
      log,
    );
    expect(r).toBe("iniciou");
    expect(enviadas).toEqual(["De 1 a 5, como foi?"]);
    // A conversa segue com o atendente, e mesmo assim a resposta é do chatbot.
    expect(await chega(c, "5")).toBe("atendeu");
    expect(enviadas.at(-1)).toBe("Obrigado! Nota 5.");
  });

  it("sem a marca manual, a automação não começa fluxo em conversa com dono humano", async () => {
    const AUTO = "efefefef-0000-4000-8000-0000000000a2";
    await fluxo(AUTO, { ...desenho, nodes: [no("m", "inicio_automacao"), ...desenho.nodes.slice(1)] });
    const c = await conversaNova({ atendente: ATENDENTE });
    const r = await iniciarChatbotPorAutomacao(
      pool,
      admin,
      {
        flow_id: AUTO,
        contact_id: c.contato,
        conversation_id: c.conversa,
        channel_session_id: SESSION,
        boundary: {
          organization_id: ORG,
          contact_id: c.contato,
          conversation_id: c.conversa,
          service_revision: 0,
          demanda_id: null,
          demanda_revision: null,
        },
        variaveis: {},
        regra_id: null,
      },
      ORG,
      log,
    );
    expect(r).toBe("descartado");
    expect(enviadas).toEqual([]);
  });

  it("fluxo sem 'Iniciar manualmente' não começa por pedido manual", async () => {
    const SO_CANAL = "efefefef-0000-4000-8000-0000000000a3";
    await fluxo(SO_CANAL, { nodes: [no("ini", "inicio_canal"), no("x", "enviar_mensagem", { texto: "x" })], edges: [liga("ini", "x")] });
    const c = await conversaNova();
    const r = await iniciarChatbotPorAutomacao(
      pool,
      admin,
      {
        flow_id: SO_CANAL,
        contact_id: c.contato,
        conversation_id: c.conversa,
        channel_session_id: SESSION,
        boundary: {
          organization_id: ORG,
          contact_id: c.contato,
          conversation_id: c.conversa,
          service_revision: 0,
          demanda_id: null,
          demanda_revision: null,
        },
        variaveis: {},
        regra_id: null,
        manual: true,
      },
      ORG,
      log,
    );
    expect(r).toBe("descartado");
  });
});

describe("Bloquear e Excluir contato", () => {
  it("bloquear grava is_blocked, audita e deixa nota", async () => {
    const F = "efefefef-0000-4000-8000-0000000000b1";
    await fluxo(F, {
      nodes: [no("ini", "inicio_canal"), no("b", "bloquear_contato", { mensagem: "Até mais." })],
      edges: [liga("ini", "b")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(enviadas).toEqual(["Até mais."]);
    const { rows } = await pool.query<{ is_blocked: boolean; blocked_reason: string }>(
      `select is_blocked, blocked_reason from contacts where id = $1`,
      [c.contato],
    );
    expect(rows[0]).toEqual({ is_blocked: true, blocked_reason: "chatbot" });
    expect(auditorias.map((a) => a.action)).toContain("contact.blocked");
    // Bloqueado, a próxima mensagem não é respondida.
    enviadas.length = 0;
    expect(await chega(c, "oi de novo")).toBe("nao_atende");
    expect(enviadas).toEqual([]);
  });

  it("excluir abre UM pedido LGPD por contato e avisa a Central, sem apagar nada", async () => {
    const F = "efefefef-0000-4000-8000-0000000000b2";
    await fluxo(F, {
      nodes: [no("ini", "inicio_canal"), no("x", "excluir_contato")],
      edges: [liga("ini", "x")],
    });
    const c = await conversaNova();
    expect(await chega(c, "apaga meus dados")).toBe("atendeu");
    expect(pedidosLgpd).toEqual([
      expect.objectContaining({ organizationId: ORG, requestType: "redact", source: "manual", contactId: c.contato, slaDays: 15 }),
    ]);
    const aviso = await pool.query<{ title: string }>(
      `select title from agent_inbox_items where organization_id = $1 and ref_id = $2 and kind = 'chatbot_aviso'`,
      [ORG, c.conversa],
    );
    expect(aviso.rows.map((r) => r.title)).toEqual(["Pedido de exclusão de dados (LGPD) aberto pelo chatbot"]);
    const contato = await pool.query(`select 1 from contacts where id = $1`, [c.contato]);
    expect(contato.rowCount).toBe(1);

    // Já há pedido aberto para o contato: não abre outro.
    await pool.query(
      `insert into lgpd_requests (organization_id, request_type, source, contact_id, due_at, status)
       values ($1, 'redact', 'manual', $2, now() + interval '15 days', 'received')`,
      [ORG, c.contato],
    );
    await pool.query(
      `update chatbot_sessions set ended_at = now() - interval '7 hours', updated_at = now() - interval '7 hours'
        where conversation_id = $1`,
      [c.conversa],
    );
    pedidosLgpd.length = 0;
    await chega(c, "apaga de novo");
    expect(pedidosLgpd).toEqual([]);
  });
});

describe("Condições da conversa lendo o banco", () => {
  const F = "efefefef-0000-4000-8000-0000000000c1";
  const desenho = {
    nodes: [
      no("ini", "inicio_canal"),
      no("canal", "canal_da_conversa", { canais: [SESSION] }),
      no("prim", "primeira_conversa"),
      no("esp", "status_da_conversa"),
      no("fim", "enviar_mensagem", { texto: "canal ok, primeira, esperando" }),
      no("outro", "enviar_mensagem", { texto: "caiu fora" }),
    ],
    edges: [
      liga("ini", "canal"),
      liga("canal", "prim", "sim"),
      liga("canal", "outro", "nao"),
      liga("prim", "esp", "sim"),
      liga("prim", "outro", "nao"),
      liga("esp", "fim", "sim"),
      liga("esp", "outro", "nao"),
    ],
  };

  it("contato novo, pelo número marcado, esperando resposta: segue pelos três 'sim'", async () => {
    await fluxo(F, desenho);
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(enviadas).toEqual(["canal ok, primeira, esperando"]);
  });

  it("contato que já falou num atendimento anterior não é 'primeira conversa'", async () => {
    await fluxo(F, desenho);
    const c = await conversaNova();
    await pool.query(
      `insert into messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction,
                             status, body, sent_via, sent_at, created_at)
       values ($1, $2, $3, $4, 'text', 'inbound', 'delivered', 'mês passado', 'external_device',
               now() - interval '30 days', now() - interval '30 days')`,
      [ORG, c.conversa, SESSION, c.contato],
    );
    await pool.query(`update conversations set service_started_at = now() - interval '1 day' where id = $1`, [c.conversa]);
    expect(await chega(c, "voltei")).toBe("atendeu");
    expect(enviadas).toEqual(["caiu fora"]);
  });
});
