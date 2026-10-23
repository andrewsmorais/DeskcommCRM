/**
 * Chatbot fase 2 (0491) contra o Postgres real, com o CÓDIGO REAL do executor
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

import { atenderPeloChatbot, retomarChatbotPeloRelogio, type PedidoDeRetomada } from "@/lib/chatbot/executar";
import { drenarRetomadasDoChatbot } from "@/lib/agent-engine/edge/crm/drain";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const admin = {} as never;

const ORG = "cbcbcbcb-0000-4000-8000-000000000001";
const CONTACT = "cbcbcbcb-0000-4000-8000-000000000002";
const SESSION = "cbcbcbcb-0000-4000-8000-000000000003";
const CONV = "cbcbcbcb-0000-4000-8000-000000000004";
const FLOW = "cbcbcbcb-0000-4000-8000-000000000005";
let seq = 10;

async function mensagem(body: string): Promise<string> {
  const id = `cbcbcbcb-0000-4000-8000-0000000000${String(seq++).padStart(2, "0")}`;
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
     values ($1, 'chatbot-relogio', 'Chatbot Relogio', 'Chatbot Relogio', 'America/Sao_Paulo')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Contato Relógio', '+5511900000099') on conflict (id) do nothing`,
    [CONTACT, ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'chatbot-relogio', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
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
      no("oi", "enviar_mensagem", { texto: "Já volto." }),
      no("espera", "aguardar_intervalo", { quantidade: 10, unidade: "minutos" }),
      no("nota", "pedir_avaliacao", {}),
      no("avisa", "notificar_atendente", { mensagem: "Cliente deu nota {{avaliacao}}" }),
    ],
    edges: [liga("ini", "oi"), liga("oi", "espera"), liga("espera", "nota"), liga("nota", "avisa")],
  };
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, 'Pesquisa', 'active', true, $3::jsonb) on conflict (id) do nothing`,
    [FLOW, ORG, JSON.stringify(grafo)],
  );
});

afterAll(() => pool.end());

describe("Aguardar intervalo → retomada pelo event_log → Pedir para avaliar → Notificar", () => {
  let pedido: PedidoDeRetomada;

  it("para no relógio, grava o token e agenda UM evento para a hora certa", async () => {
    const r = await atenderPeloChatbot(pool, admin, entrada(await mensagem("oi")), log);
    expect(r).toBe("atendeu");
    expect(enviadas).toEqual(["Já volto."]);
    const s = await sessao();
    expect(s).toMatchObject({ status: "waiting_timer", no_atual: "espera" });
    expect(s?.retomada_token).toBeTruthy();
    const faltam = new Date(s!.retomar_em!).getTime() - Date.now();
    expect(faltam).toBeGreaterThan(9 * 60_000);
    expect(faltam).toBeLessThanOrEqual(10 * 60_000);

    const { rows } = await pool.query<{ payload: PedidoDeRetomada; next_attempt_at: string; status: string }>(
      `select payload, next_attempt_at, status from event_log
        where organization_id = $1 and event_type = 'chatbot.retomada_requested'`,
      [ORG],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
    expect(new Date(rows[0]!.next_attempt_at).getTime()).toBe(new Date(s!.retomar_em!).getTime());
    expect(rows[0]!.payload.token).toBe(s!.retomada_token);
    pedido = rows[0]!.payload;
  });

  it("o drain não pega o evento antes da hora", async () => {
    await drenarRetomadasDoChatbot(pool, log as never);
    expect((await sessao())?.status).toBe("waiting_timer");
    expect(enviadas).toHaveLength(1);
  });

  it("mensagem durante a espera, com 'seguir' (padrão): o fluxo anda na hora e o evento antigo morre", async () => {
    const r = await atenderPeloChatbot(pool, admin, entrada(await mensagem("ainda aí?")), log);
    expect(r).toBe("atendeu");
    expect(enviadas.at(-1)).toBe("De 1 a 5, que nota você dá para o nosso atendimento?");
    expect(await sessao()).toMatchObject({ status: "waiting_input", no_atual: "nota", retomada_token: null });
    expect(await retomarChatbotPeloRelogio(pool, admin, pedido, ORG, log)).toBe("descartado");
  });

  it("a nota vai para chatbot_avaliacoes e para a conversa; o aviso abre na Central sem a nota no título", async () => {
    const r = await atenderPeloChatbot(pool, admin, entrada(await mensagem("5")), log);
    expect(r).toBe("atendeu");

    const { rows: av } = await pool.query(
      `select flow_id, nota, escala from chatbot_avaliacoes where organization_id = $1 and conversation_id = $2`,
      [ORG, CONV],
    );
    expect(av).toEqual([{ flow_id: FLOW, nota: 5, escala: "1_5" }]);

    const { rows: notas } = await pool.query<{ body: string; created_by_name: string }>(
      `select body, created_by_name from conversation_notes where organization_id = $1 and conversation_id = $2 order by created_at`,
      [ORG, CONV],
    );
    expect(notas.map((n) => n.body)).toEqual([
      "Avaliação do atendimento: 5 de 5.",
      "Aviso do chatbot: Cliente deu nota 5",
    ]);
    expect(new Set(notas.map((n) => n.created_by_name))).toEqual(new Set(["Chatbot"]));

    const { rows: avisos } = await pool.query(
      `select kind, ref_kind, ref_id, title, status from agent_inbox_items where organization_id = $1`,
      [ORG],
    );
    expect(avisos).toEqual([
      { kind: "chatbot_aviso", ref_kind: "conversation", ref_id: CONV, title: "Cliente deu nota …", status: "open" },
    ]);
    expect((await sessao())?.status).toBe("completed");
  });
});

describe("o relógio vence pelo drain", () => {
  it("evento vencido: o drain acorda o fluxo, marca done, e re-drenar não repete", async () => {
    // Recomeça a conversa: sessão encerrada há mais que o tempo de recomeçar.
    await pool.query(
      `update chatbot_sessions set ended_at = now() - interval '7 hours', updated_at = now() - interval '7 hours'
        where organization_id = $1 and conversation_id = $2`,
      [ORG, CONV],
    );
    enviadas.length = 0;
    await atenderPeloChatbot(pool, admin, entrada(await mensagem("oi de novo")), log);
    expect(enviadas).toEqual(["Já volto."]);

    // O relógio "venceu": sessão e evento voltam no tempo.
    await pool.query(
      `update chatbot_sessions set retomar_em = now() - interval '1 second'
        where organization_id = $1 and conversation_id = $2`,
      [ORG, CONV],
    );
    await pool.query(
      `update event_log set next_attempt_at = now() - interval '1 second'
        where organization_id = $1 and event_type = 'chatbot.retomada_requested' and status = 'pending'`,
      [ORG],
    );
    expect(await drenarRetomadasDoChatbot(pool, log as never)).toBeGreaterThanOrEqual(1);
    expect(enviadas).toEqual(["Já volto.", "De 1 a 5, que nota você dá para o nosso atendimento?"]);
    expect((await sessao())?.status).toBe("waiting_input");

    const { rows } = await pool.query<{ status: string }>(
      `select status from event_log
        where organization_id = $1 and event_type = 'chatbot.retomada_requested'
        order by created_at desc limit 1`,
      [ORG],
    );
    expect(rows[0]?.status).toBe("done");
    await drenarRetomadasDoChatbot(pool, log as never);
    expect(enviadas).toHaveLength(2);
  });
});
