/**
 * WebHook do chatbot contra o Postgres real: o executor para no passo, chama
 * (aqui um dublê da rede, `chamarWebhookDoChatbot`) e devolve a resposta ao
 * motor no MESMO turno — a mensagem seguinte já sai com a variável da resposta.
 * O teto de chamadas por mensagem segura um desenho em círculo.
 *
 * Herdado do irmão (chatbot-relogio-avaliacao-aviso): Chatbot fase 2 (0491) contra o Postgres real, com o CÓDIGO REAL do executor
 * e do drain: "Aguardar intervalo" para no relógio e agenda a retomada no
 * `event_log`; o drain acorda o fluxo uma vez só; "Pedir para avaliar" grava a
 * nota em `chatbot_avaliacoes` e na conversa; "Notificar atendente" abre o
 * aviso `chatbot_aviso` na Central sem a resposta do contato no título.
 *
 * Fica de fora o que não é banco: o envio ao WhatsApp (o handler de mensagens
 * é um espião), a leitura do plano e a janela de envio do número.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

const enviadas: string[] = [];
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(async (_admin: unknown, _ctx: unknown, input: { body: string }) => {
    enviadas.push(input.body);
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
const chamadas: { url: string; respostas: Record<string, string> }[] = [];
vi.mock("@/lib/chatbot/webhook", () => ({
  chamarWebhookDoChatbot: vi.fn(async (c: { url: string }, envio: { respostas: Record<string, string> }) => {
    chamadas.push({ url: c.url, respostas: envio.respostas });
    return { ok: true, status: 200, corpo: { pedido: { status: "enviado" } } };
  }),
}));

import { atenderPeloChatbot, WEBHOOKS_POR_TURNO } from "@/lib/chatbot/executar";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const admin = {} as never;

const ORG = "cdcdcdcd-0000-4000-8000-000000000001";
const CONTACT = "cdcdcdcd-0000-4000-8000-000000000002";
const SESSION = "cdcdcdcd-0000-4000-8000-000000000003";
const CONV = "cdcdcdcd-0000-4000-8000-000000000004";
const FLOW = "cdcdcdcd-0000-4000-8000-000000000005";
let seq = 10;

async function mensagem(body: string): Promise<string> {
  const id = `cdcdcdcd-0000-4000-8000-0000000000${String(seq++).padStart(2, "0")}`;
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
     values ($1, 'chatbot-webhook', 'Chatbot Webhook', 'Chatbot Webhook', 'America/Sao_Paulo')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Contato Webhook', '+5511900000098') on conflict (id) do nothing`,
    [CONTACT, ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'chatbot-webhook', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [SESSION, ORG],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'open', false) on conflict (id) do nothing`,
    [CONV, ORG, CONTACT, SESSION],
  );
  const grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("p", "pedir_digitar", { pergunta: "Número do pedido?", variavel: "pedido" }),
      no("hook", "webhook", {
        url: "https://loja.exemplo.com.br/pedidos/{{pedido}}",
        metodo: "GET",
        campos: [{ caminho: "pedido.status", variavel: "status" }],
      }),
      no("ok", "enviar_mensagem", { texto: "Seu pedido {{pedido}} está: {{status}}" }),
    ],
    edges: [liga("ini", "p"), liga("p", "hook"), liga("hook", "ok")],
  };
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, 'Rastreio', 'active', true, $3::jsonb) on conflict (id) do nothing`,
    [FLOW, ORG, JSON.stringify(grafo)],
  );
});

afterAll(() => pool.end());

describe("WebHook pelo executor real", () => {
  it("a resposta da chamada entra na mensagem seguinte, no mesmo turno", async () => {
    expect(await atenderPeloChatbot(pool, admin, entrada(await mensagem("oi")), log)).toBe("atendeu");
    expect(enviadas).toEqual(["Número do pedido?"]);
    expect(await atenderPeloChatbot(pool, admin, entrada(await mensagem("1234")), log)).toBe("atendeu");
    expect(chamadas).toEqual([
      { url: "https://loja.exemplo.com.br/pedidos/{{pedido}}", respostas: { pedido: "1234" } },
    ]);
    expect(enviadas.at(-1)).toBe("Seu pedido 1234 está: enviado");
    expect((await sessao())?.status).toBe("completed");
  });

  it("desenho em círculo de WebHooks para no teto por mensagem", async () => {
    const circulo = {
      nodes: [no("ini", "inicio_canal"), no("h1", "webhook", { url: "https://a.exemplo.com" })],
      edges: [liga("ini", "h1"), liga("h1", "h1")],
    };
    await pool.query(`update chatbot_flows set grafo = $2::jsonb where id = $1`, [FLOW, JSON.stringify(circulo)]);
    await pool.query(
      `update chatbot_sessions set ended_at = now() - interval '7 hours', updated_at = now() - interval '7 hours'
        where organization_id = $1 and conversation_id = $2`,
      [ORG, CONV],
    );
    chamadas.length = 0;
    expect(await atenderPeloChatbot(pool, admin, entrada(await mensagem("de novo")), log)).toBe("atendeu");
    expect(chamadas).toHaveLength(WEBHOOKS_POR_TURNO);
    expect((await sessao())?.status).toBe("completed");
  });
});
