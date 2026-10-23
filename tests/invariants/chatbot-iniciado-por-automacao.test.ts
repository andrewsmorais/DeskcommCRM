/**
 * Chatbot iniciado por AUTOMAÇÃO (ação "Iniciar chatbot", Kiwify/Cakto) contra
 * o Postgres real, com o executor e o drain reais:
 *   - o pedido `chatbot.inicio_requested` no event_log vira fluxo andando, com
 *     as variáveis do negócio nas mensagens e o envio marcado como proativo;
 *   - quem estava parado em outro fluxo sai dele (o fato mais novo vence);
 *   - fluxo só de automação, ligado, não responde mensagem que chega.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

const enviadas: string[] = [];
const proativas: boolean[] = [];
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(async (_admin: unknown, ctx: { proactiveContext?: unknown }, input: { body: string }) => {
    enviadas.push(input.body);
    proativas.push(Boolean(ctx.proactiveContext));
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

import { atenderPeloChatbot } from "@/lib/chatbot/executar";
import { drenarComandosDoChatbot } from "@/lib/agent-engine/edge/crm/drain";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const admin = {} as never;

const ORG = "cececece-0000-4000-8000-000000000001";
const CONTACT = "cececece-0000-4000-8000-000000000002";
const SESSION = "cececece-0000-4000-8000-000000000003";
const CONV = "cececece-0000-4000-8000-000000000004";
const FLOW = "cececece-0000-4000-8000-000000000005";
const MENU = "cececece-0000-4000-8000-000000000006";
let seq = 10;

async function mensagem(body: string): Promise<string> {
  const id = `cececece-0000-4000-8000-0000000000${String(seq++).padStart(2, "0")}`;
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, body, sent_via, sent_at)
     values ($1, $2, $3, $4, $5, 'text', 'inbound', 'delivered', $6, 'external_device', now())`,
    [id, ORG, CONV, SESSION, CONTACT, body],
  );
  return id;
}
const entrada = (inboundMessageId: string) => ({
  organizationId: ORG,
  conversationId: CONV,
  contactId: CONTACT,
  channelSessionId: SESSION,
  inboundMessageId,
});
const sessao = async () =>
  (
    await pool.query<{ status: string; no_atual: string | null; retomar_em: string | null; retomada_token: string | null }>(
      `select status, no_atual, retomar_em, retomada_token from chatbot_sessions
        where organization_id = $1 and conversation_id = $2 and flow_id = $3`,
      [ORG, CONV, FLOW],
    )
  ).rows[0];

const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle = "proximo") => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle,
});

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-automacao', 'Chatbot Automacao', 'Chatbot Automacao', 'America/Sao_Paulo')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Comprador', '+5511900000097') on conflict (id) do nothing`,
    [CONTACT, ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'chatbot-automacao', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [SESSION, ORG],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'open', false) on conflict (id) do nothing`,
    [CONV, ORG, CONTACT, SESSION],
  );
  const venda = {
    nodes: [
      no("auto", "inicio_automacao"),
      no("msg", "enviar_mensagem", { texto: "Oi {{nome_cliente}}! Seu acesso ao {{produto}} está liberado." }),
      no("p", "pedir_digitar", { pergunta: "Conseguiu entrar?", variavel: "entrou" }),
    ],
    edges: [liga("auto", "msg"), liga("msg", "p")],
  };
  const menu = {
    nodes: [
      no("ini", "inicio_canal"),
      no("m", "pedir_escolher", { pergunta: "Como posso ajudar?", opcoes: ["Comprar", "Suporte"] }),
    ],
    edges: [liga("ini", "m")],
  };
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo, updated_at)
     values ($1, $2, 'Compra aprovada', 'active', true, $3::jsonb, now()),
            ($4, $2, 'Menu', 'active', true, $5::jsonb, now() - interval '1 day')
     on conflict (id) do nothing`,
    [FLOW, ORG, JSON.stringify(venda), MENU, JSON.stringify(menu)],
  );
});

afterAll(() => pool.end());

async function pedirInicio(variaveis: Record<string, string>) {
  // O envio é um dublê aqui, então basta uma fronteira bem formada (a real
  // vem de `serviceForAutomation`, provada nos testes das automações).
  const { rows } = await pool.query<{ service_revision: number }>(
    `select service_revision::float8 as service_revision from conversations where organization_id = $1 and id = $2`,
    [ORG, CONV],
  );
  const fronteira = {
    organization_id: ORG,
    contact_id: CONTACT,
    conversation_id: CONV,
    service_revision: Number(rows[0]!.service_revision),
    demanda_id: null,
    demanda_revision: null,
  };
  await pool.query(
    `insert into event_log (organization_id, event_type, entity_kind, entity_id, payload)
     values ($1, 'chatbot.inicio_requested', 'contact', $2, $3::jsonb)`,
    [
      ORG,
      CONTACT,
      JSON.stringify({
        flow_id: FLOW,
        contact_id: CONTACT,
        conversation_id: CONV,
        channel_session_id: SESSION,
        boundary: fronteira,
        variaveis,
        regra_id: "regra-teste",
      }),
    ],
  );
}

describe("chatbot iniciado por automação", () => {
  it("o menu (Iniciar por um canal) responde mensagem; o fluxo de automação, ligado junto, não", async () => {
    expect(await atenderPeloChatbot(pool, admin, entrada(await mensagem("oi")), log)).toBe("atendeu");
    expect(enviadas.at(-1)).toBe("Como posso ajudar?\n\n1. Comprar\n2. Suporte");
    const { rows } = await pool.query(
      `select f.name from chatbot_sessions s join chatbot_flows f on f.id = s.flow_id
        where s.organization_id = $1 and s.status = 'waiting_input'`,
      [ORG],
    );
    expect(rows.map((r) => r.name)).toEqual(["Menu"]);
  });

  it("o pedido no event_log vira fluxo andando, com as variáveis do negócio e envio proativo", async () => {
    enviadas.length = 0;
    proativas.length = 0;
    await pedirInicio({ produto: "Curso de Bolos", nome_cliente: "Ana" });
    expect(await drenarComandosDoChatbot(pool, log as never)).toBe(1);
    expect(enviadas).toEqual(["Oi Ana! Seu acesso ao Curso de Bolos está liberado.", "Conseguiu entrar?"]);
    expect(proativas).toEqual([true, true]);
  });

  it("quem estava no menu saiu dele: a próxima resposta é do fluxo da venda", async () => {
    const { rows } = await pool.query(
      `select f.name, s.status from chatbot_sessions s join chatbot_flows f on f.id = s.flow_id
        where s.organization_id = $1 order by f.name`,
      [ORG],
    );
    expect(rows).toEqual([
      { name: "Compra aprovada", status: "waiting_input" },
      { name: "Menu", status: "completed" },
    ]);
    const { rows: ev } = await pool.query(
      `select status from event_log where organization_id = $1 and event_type = 'chatbot.inicio_requested'`,
      [ORG],
    );
    expect(ev.map((r) => r.status)).toEqual(["done"]);
  });

  it("fluxo desligado: o pedido é descartado sem mandar nada", async () => {
    await pool.query(`update chatbot_flows set is_active = false where id = $1`, [FLOW]);
    enviadas.length = 0;
    await pedirInicio({ produto: "X" });
    await drenarComandosDoChatbot(pool, log as never);
    expect(enviadas).toEqual([]);
  });
});
