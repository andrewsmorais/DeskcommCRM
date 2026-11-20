/**
 * Os blocos da Umbler que entraram em 03/11/2026, contra o Postgres real, com
 * o CÓDIGO REAL do executor (lib/chatbot/executar.ts):
 *   - "Transferir p/ agentes de IA": sem agente publicado no número, segue por
 *     "Sem agente de IA" e não entrega; com agente, entrega pela função do botão
 *     da Inbox e devolve `nao_atende` — a IA responde a MESMA mensagem;
 *   - "Fluxo de espera": desligar desarma o relógio da transferência (sem token,
 *     o evento já agendado é descartado); ligar rearma e agenda de novo;
 *   - "Enviar template": em número sem modelo (QR Code), segue por "Não
 *     enviado" e deixa nota com o motivo.
 *
 * Fora: envio ao WhatsApp (espião), plano, janela, auditoria e a devolução ao
 * agente (dublê — `devolverAtendimentoAoAgente` tem teste próprio).
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
const devolvidas: string[] = [];
vi.mock("@/lib/escalacao/retomada", () => ({
  devolverAtendimentoAoAgente: vi.fn(async (_deps: unknown, input: { conversationId: string }) => {
    devolvidas.push(input.conversationId);
    return { ok: true };
  }),
}));

import { atenderPeloChatbot, iniciarChatbotPorAutomacao } from "@/lib/chatbot/executar";

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

const ORG = "f2f2f2f2-0000-4000-8000-000000000001";
const SEM_AGENTE = "f2f2f2f2-0000-4000-8000-000000000003";
const COM_AGENTE = "f2f2f2f2-0000-4000-8000-000000000004";
let seq = 0;
const id = (p: string) => `f2f2f2f2-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

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

async function conversaNova(numero: string) {
  const contato = id("1111");
  const conversa = id("2222");
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'Cliente', $3)`,
    [contato, ORG, `+55219${String(seq).padStart(8, "0")}`],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'open', false)`,
    [conversa, ORG, contato, numero],
  );
  return { contato, conversa, numero };
}

async function chega(c: { contato: string; conversa: string; numero: string }, body: string) {
  const mid = id("3333");
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, body, sent_via, sent_at)
     values ($1, $2, $3, $4, $5, 'text', 'inbound', 'delivered', $6, 'external_device', now())`,
    [mid, ORG, c.conversa, c.numero, c.contato, body],
  );
  await pool.query(`update conversations set last_inbound_at = now() where id = $1`, [c.conversa]);
  return atenderPeloChatbot(
    pool,
    admin,
    {
      organizationId: ORG,
      conversationId: c.conversa,
      contactId: c.contato,
      channelSessionId: c.numero,
      inboundMessageId: mid,
    },
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

async function iniciarManual(
  fid: string,
  c: { contato: string; conversa: string; numero: string },
) {
  return iniciarChatbotPorAutomacao(
    pool,
    admin,
    {
      flow_id: fid,
      contact_id: c.contato,
      conversation_id: c.conversa,
      channel_session_id: c.numero,
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
      iniciado_por: null,
    },
    ORG,
    log,
  );
}

const notas = async (conversa: string) =>
  (
    await pool.query<{ body: string }>(
      `select body from conversation_notes where conversation_id = $1 order by created_at`,
      [conversa],
    )
  ).rows.map((r) => r.body);

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-fase-2', 'chatbot-fase-2', 'chatbot-fase-2', 'America/Sao_Paulo') on conflict (id) do nothing`,
    [ORG],
  );
  for (const [sid, nome] of [
    [SEM_AGENTE, "fase2-sem-agente"],
    [COM_AGENTE, "fase2-com-agente"],
  ]) {
    await pool.query(
      `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
       values ($1, $2, $3, 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
      [sid, ORG, nome],
    );
  }
  // Agente publicado só no número COM_AGENTE (a mesma forma do portão de capacidade).
  const agente = id("4444");
  const versao = id("5555");
  await pool.query(
    `insert into ai_agents (id, organization_id, name, system_prompt, kind)
     values ($1, $2, 'Agente fase 2', 'você é um atendente', 'mcp_agent')`,
    [agente, ORG],
  );
  await pool.query(
    `insert into ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt,
                                    provider, model, channel_session_id, status, published_at)
     values ($1, $2, $3, 1, 'você é um atendente', 'anthropic', 'claude-sonnet-4-6', $4, 'published', now())`,
    [versao, ORG, agente, COM_AGENTE],
  );
  await pool.query(`update ai_agents set published_version_id = $1 where id = $2`, [
    versao,
    agente,
  ]);
});
beforeEach(() => {
  enviadas.length = 0;
  devolvidas.length = 0;
});
afterAll(() => pool.end());

describe("Transferir p/ agentes de IA", () => {
  const FLUXO = "f2f2f2f2-0000-4000-8000-0000000000a1";
  const desenho = {
    nodes: [
      no("ini", "inicio_canal"),
      no("ia", "transferir_ia", { mensagem: "Vou te passar para o assistente." }),
      no("sem", "enviar_mensagem", { texto: "Agora não temos assistente. Já te respondemos." }),
    ],
    edges: [liga("ini", "ia"), liga("ia", "sem", "falha")],
  };

  it("número sem agente publicado: não entrega e segue por Sem agente de IA", async () => {
    await fluxo(FLUXO, desenho);
    const c = await conversaNova(SEM_AGENTE);
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(devolvidas).toEqual([]);
    expect(enviadas).toEqual(["Agora não temos assistente. Já te respondemos."]);
  });

  it("número com agente: entrega, manda a mensagem e deixa a IA responder a mesma mensagem", async () => {
    await fluxo(FLUXO, desenho);
    const c = await conversaNova(COM_AGENTE);
    expect(await chega(c, "oi")).toBe("nao_atende");
    expect(devolvidas).toEqual([c.conversa]);
    expect(enviadas).toEqual(["Vou te passar para o assistente."]);
    const { rows } = await pool.query<{ status: string }>(
      `select status from chatbot_sessions where conversation_id = $1`,
      [c.conversa],
    );
    expect(rows[0]?.status).toBe("transferred");
  });
});

describe("Fluxo de espera", () => {
  const TRANSFERE = "f2f2f2f2-0000-4000-8000-0000000000b1";
  const DESLIGA = "f2f2f2f2-0000-4000-8000-0000000000b2";
  const LIGA = "f2f2f2f2-0000-4000-8000-0000000000b3";
  const transfere = {
    nodes: [
      no("ini", "inicio_canal"),
      no("t", "transferir_equipe", {
        mensagem: "Um atendente já vem.",
        espera_minutos: 10,
        espera_mensagem: "Ainda estamos aqui!",
        espera_vezes: 2,
      }),
    ],
    edges: [liga("ini", "t")],
  };
  const retomadas = async (conversa: string) =>
    (
      await pool.query<{ n: number }>(
        `select count(*)::int as n from event_log
          where organization_id = $1 and event_type = 'chatbot.retomada_requested' and entity_id = (
            select id from chatbot_sessions where conversation_id = $2 and flow_id = $3)`,
        [ORG, conversa, TRANSFERE],
      )
    ).rows[0]!.n;
  const espera = async (conversa: string) =>
    (
      await pool.query<{ retomar_em: string | null; retomada_token: string | null }>(
        `select retomar_em::text, retomada_token from chatbot_sessions
          where conversation_id = $1 and flow_id = $2`,
        [conversa, TRANSFERE],
      )
    ).rows[0];

  it("desligar, num fluxo manual, desarma a espera da transferência", async () => {
    await fluxo(TRANSFERE, transfere);
    const c = await conversaNova(SEM_AGENTE);
    expect(await chega(c, "quero falar com alguém")).toBe("atendeu");
    expect((await espera(c.conversa))?.retomar_em).not.toBeNull();

    // Desde 11/11/2026, um fluxo de ENTRADA não entra num atendimento que o
    // chatbot já entregou à equipe (um atendimento, uma passagem — como na
    // Umbler): a mensagem nova do cliente não começa o fluxo que desliga.
    await fluxo(DESLIGA, {
      nodes: [
        no("ini", "inicio_canal"),
        no("m", "inicio_manual"),
        no("e", "fluxo_de_espera", { acao: "desligar" }),
      ],
      edges: [liga("ini", "e"), liga("m", "e")],
    });
    expect(await chega(c, "alô?")).toBe("nao_atende");
    expect((await espera(c.conversa))?.retomar_em).not.toBeNull();

    // Quem desliga a espera no meio do atendimento é a equipe (início manual)
    // ou uma automação. (O próprio início manual já solta a espera do outro
    // fluxo — "o fato mais novo vence" —, então o passo não tem o que desligar
    // e não deixa nota: o que importa é a espera desarmada.)
    expect(await iniciarManual(DESLIGA, c)).toBe("iniciou");
    expect(await espera(c.conversa)).toEqual({ retomar_em: null, retomada_token: null });
  });

  it("ligar, num fluxo manual, rearma a espera que o início manual tinha parado", async () => {
    await fluxo(LIGA, {
      nodes: [no("m", "inicio_manual"), no("e", "fluxo_de_espera", { acao: "ligar" })],
      edges: [liga("m", "e")],
    });
    await fluxo(TRANSFERE, transfere);
    const c = await conversaNova(SEM_AGENTE);
    expect(await chega(c, "quero falar com alguém")).toBe("atendeu");
    const antes = await retomadas(c.conversa);

    expect(await iniciarManual(LIGA, c)).toBe("iniciou");
    const depois = await espera(c.conversa);
    expect(depois?.retomar_em).not.toBeNull();
    expect(depois?.retomada_token).not.toBeNull();
    expect(await retomadas(c.conversa)).toBe(antes + 1);
    expect(await notas(c.conversa)).toContain(
      "O chatbot ligou de novo as mensagens de espera desta conversa.",
    );
  });
});

describe("Enviar template", () => {
  const FLUXO = "f2f2f2f2-0000-4000-8000-0000000000c1";

  it("número sem modelo: segue por Não enviado e deixa nota com o motivo", async () => {
    await fluxo(FLUXO, {
      nodes: [
        no("ini", "inicio_canal"),
        no("t", "enviar_template", { template_id: "f2f2f2f2-0000-4000-8000-0000000000ff" }),
        no("ok", "enviar_mensagem", { texto: "saiu" }),
        no("x", "enviar_mensagem", { texto: "Te escrevo por aqui mesmo." }),
      ],
      edges: [liga("ini", "t"), liga("t", "ok"), liga("t", "x", "falha")],
    });
    const c = await conversaNova(SEM_AGENTE);
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(enviadas).toEqual(["Te escrevo por aqui mesmo."]);
    expect((await notas(c.conversa)).join("\n")).toContain("o modelo escolhido não existe mais");
  });
});
