/**
 * Um atendimento, uma passagem pelo chatbot (11/11/2026, como na Umbler Talk).
 *
 * Contra o Postgres real e o CÓDIGO REAL do executor (lib/chatbot/executar.ts).
 * Antes, a única barreira para recomeçar o fluxo eram 6 h: o contato que ficava
 * sem resposta na fila humana — ou conversando com a IA para quem o chatbot o
 * passou — recebia o menu de novo no meio do atendimento (cards 54 e 58 da
 * auditoria funcional). Agora:
 *   - entregue à equipe ou à IA, o chatbot não volta NESTE atendimento, nem
 *     depois de 6 h;
 *   - finalizado o atendimento, o contato que escreve de novo recebe o fluxo;
 *   - sem entrega, as 6 h seguem como rede para quem nunca finaliza;
 *   - a palavra-chave recomeça na hora (é pedido explícito do contato);
 *   - "Transferir p/ agentes de IA" pode nomear o agente; agente não publicado
 *     segue por "Sem agente de IA".
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

const ORG = "a7a7a7a7-0000-4000-8000-000000000001";
const NUMERO = "a7a7a7a7-0000-4000-8000-000000000002";
const AGENTE = "a7a7a7a7-0000-4000-8000-000000000003";
const VERSAO = "a7a7a7a7-0000-4000-8000-000000000004";
const RASCUNHO = "a7a7a7a7-0000-4000-8000-000000000005";
let seq = 0;
const id = (p: string) => `a7a7a7a7-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

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

type Conversa = { contato: string; conversa: string };

async function conversaNova(): Promise<Conversa> {
  const contato = id("1111");
  const conversa = id("2222");
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'Cliente', $3)`,
    [contato, ORG, `+55319${String(seq).padStart(8, "0")}`],
  );
  // O atendimento começou há 1 dia: dá espaço para "voltar o relógio" da sessão.
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group,
                                created_at, service_started_at)
     values ($1, $2, $3, $4, 'open', false, now() - interval '1 day', now() - interval '1 day')`,
    [conversa, ORG, contato, NUMERO],
  );
  return { contato, conversa };
}

async function chega(c: Conversa, body: string) {
  const mid = id("3333");
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, body, sent_via, sent_at)
     values ($1, $2, $3, $4, $5, 'text', 'inbound', 'delivered', $6, 'external_device', now())`,
    [mid, ORG, c.conversa, NUMERO, c.contato, body],
  );
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

/** "Passaram 7 horas": a sessão e a passagem envelhecem; o atendimento continua o mesmo. */
async function passam7Horas(c: Conversa) {
  await pool.query(
    `update chatbot_sessions
        set started_at = started_at - interval '7 hours', updated_at = updated_at - interval '7 hours',
            ended_at = ended_at - interval '7 hours', entregue_em = entregue_em - interval '7 hours'
      where conversation_id = $1`,
    [c.conversa],
  );
  await pool.query(
    `update conversations set last_handoff_at = last_handoff_at - interval '7 hours' where id = $1`,
    [c.conversa],
  );
}

async function finalizaEReabre(c: Conversa) {
  await pool.query(`select public.fn_service_status($1, $2, 'closed')`, [ORG, c.conversa]);
  await pool.query(`select public.fn_service_status($1, $2, 'open')`, [ORG, c.conversa]);
}

async function fluxo(grafo: unknown) {
  await pool.query(`update chatbot_flows set is_active = false where organization_id = $1`, [ORG]);
  const fid = id("aaaa");
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, $3, 'active', true, $4::jsonb)`,
    [fid, ORG, `Fluxo ${fid.slice(-4)}`, JSON.stringify(grafo)],
  );
  return fid;
}

const sessao = async (c: Conversa) =>
  (
    await pool.query<{ entregue_a: string | null }>(
      `select entregue_a from chatbot_sessions where conversation_id = $1`,
      [c.conversa],
    )
  ).rows[0];

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-uma-passagem', 'chatbot-uma-passagem', 'chatbot-uma-passagem', 'America/Sao_Paulo')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'uma-passagem', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [NUMERO, ORG],
  );
  // Um agente publicado (o que pode ser escolhido) e um em rascunho (não pode).
  await pool.query(
    `insert into ai_agents (id, organization_id, name, system_prompt, kind)
     values ($1, $2, 'Vendas', 'você vende', 'mcp_agent'), ($3, $2, 'Rascunho', 'rascunho', 'mcp_agent')
     on conflict (id) do nothing`,
    [AGENTE, ORG, RASCUNHO],
  );
  await pool.query(
    `insert into ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt,
                                    provider, model, channel_session_id, status, published_at)
     values ($1, $2, $3, 1, 'você vende', 'anthropic', 'claude-sonnet-4-6', $4, 'published', now())
     on conflict (id) do nothing`,
    [VERSAO, ORG, AGENTE, NUMERO],
  );
  await pool.query(`update ai_agents set published_version_id = $1 where id = $2`, [
    VERSAO,
    AGENTE,
  ]);
});
beforeEach(() => {
  enviadas.length = 0;
  devolvidas.length = 0;
});
afterAll(() => pool.end());

describe("entregue à equipe, o chatbot não volta no mesmo atendimento", () => {
  const desenho = {
    nodes: [
      no("ini", "inicio_canal"),
      no("menu", "enviar_mensagem", { texto: "MENU-EQUIPE" }),
      no("eq", "transferir_equipe"),
    ],
    edges: [liga("ini", "menu"), liga("menu", "eq")],
  };

  it("depois de 7 h na fila, a mensagem nova NÃO traz o menu de volta", async () => {
    await fluxo(desenho);
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(enviadas).toEqual(["MENU-EQUIPE"]);
    expect(await sessao(c)).toEqual({ entregue_a: "equipe" });

    await passam7Horas(c);
    enviadas.length = 0;
    expect(await chega(c, "alguém aí?")).toBe("nao_atende");
    expect(enviadas).toEqual([]);
  });

  it("finalizado o atendimento, o contato que escreve de novo recebe o fluxo", async () => {
    await fluxo(desenho);
    const c = await conversaNova();
    await chega(c, "oi");
    await finalizaEReabre(c);
    enviadas.length = 0;
    expect(await chega(c, "voltei")).toBe("atendeu");
    expect(enviadas).toEqual(["MENU-EQUIPE"]);
  });
});

describe("entregue à IA, o chatbot não toma a conversa do agente", () => {
  it("depois de 7 h com a IA, o chatbot fica de fora", async () => {
    await fluxo({
      nodes: [no("ini", "inicio_canal"), no("ia", "transferir_ia", { mensagem: "IA-ASSUME" })],
      edges: [liga("ini", "ia")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("nao_atende");
    expect(devolvidas).toEqual([c.conversa]);
    expect(await sessao(c)).toEqual({ entregue_a: "ia" });

    await passam7Horas(c);
    enviadas.length = 0;
    devolvidas.length = 0;
    expect(await chega(c, "e aí?")).toBe("nao_atende");
    expect(enviadas).toEqual([]);
    expect(devolvidas).toEqual([]);
  });

  it("agente escolhido no passo fica gravado na conversa para o turno da IA", async () => {
    await fluxo({
      nodes: [no("ini", "inicio_canal"), no("ia", "transferir_ia", { agent_id: AGENTE })],
      edges: [liga("ini", "ia")],
    });
    const c = await conversaNova();
    expect(await chega(c, "quero comprar")).toBe("nao_atende");
    const { rows } = await pool.query<{ active_ai_agent_id: string; active_intent: string }>(
      `select active_ai_agent_id, active_intent from conversations where id = $1`,
      [c.conversa],
    );
    expect(rows[0]).toEqual({ active_ai_agent_id: AGENTE, active_intent: "chatbot" });
  });

  it("agente escolhido sem versão publicada segue por 'Sem agente de IA'", async () => {
    await fluxo({
      nodes: [
        no("ini", "inicio_canal"),
        no("ia", "transferir_ia", { agent_id: RASCUNHO }),
        no("sem", "enviar_mensagem", { texto: "SEM-AGENTE" }),
      ],
      edges: [liga("ini", "ia"), liga("ia", "sem", "falha")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(devolvidas).toEqual([]);
    expect(enviadas).toEqual(["SEM-AGENTE"]);
  });
});

describe("sem entrega, as regras de recomeço", () => {
  it("toda conversa nova: dentro de 6 h não recomeça; depois de 6 h, recomeça (rede)", async () => {
    await fluxo({
      nodes: [no("ini", "inicio_canal"), no("oi", "enviar_mensagem", { texto: "BOAS-VINDAS" })],
      edges: [liga("ini", "oi")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    enviadas.length = 0;
    expect(await chega(c, "obrigado")).toBe("nao_atende");
    expect(enviadas).toEqual([]);
    await passam7Horas(c);
    expect(await chega(c, "oi de novo")).toBe("atendeu");
    expect(enviadas).toEqual(["BOAS-VINDAS"]);
  });

  it("palavra-chave recomeça na hora, e vence o 'toda conversa nova' que vem antes no desenho", async () => {
    await fluxo({
      nodes: [
        no("geral", "inicio_canal"),
        no("chave", "inicio_canal", { gatilho: "palavra_chave", palavras: ["menu"] }),
        no("g", "enviar_mensagem", { texto: "GERAL" }),
        no("m", "enviar_mensagem", { texto: "MENU" }),
      ],
      edges: [liga("geral", "g"), liga("chave", "m")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(enviadas).toEqual(["GERAL"]);
    enviadas.length = 0;
    expect(await chega(c, "MENU por favor")).toBe("atendeu");
    expect(enviadas).toEqual(["MENU"]);
  });
});
