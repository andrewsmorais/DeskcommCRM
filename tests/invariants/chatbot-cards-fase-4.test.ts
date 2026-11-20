/**
 * Cards novos que leem o banco, contra o Postgres real e o CÓDIGO REAL do
 * executor:
 *   - "Etapa do funil": lê os negócios ABERTOS do contato (crm_leads) — negócio
 *     ganho/perdido não conta, e o de outro contato também não;
 *   - "Enviar produto": lê o Catálogo NA HORA (preço atual, só produto ativo,
 *     só da organização); desativado não sai e vira nota;
 *   - "Enviar contato": sai como cartão de contato (type contact).
 *
 * Fora: envio ao WhatsApp (espião que guarda o pedido inteiro), plano, janela.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";

type Envio = { type?: string; body?: string; metadata?: Record<string, unknown> };
const pedidos: Envio[] = [];
const enviadas: string[] = [];
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(async (_admin: unknown, _ctx: unknown, input: Envio) => {
    pedidos.push(input);
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
// A inscrição de verdade é provada nos testes do follow-up; aqui o que se mede
// é o que o chatbot faz com cada desfecho dela (a nota para a equipe).
let desfechoDaInscricao: { ok: true } | { ok: false; code: string; message: string; status: number } = {
  ok: true,
};
vi.mock("@/lib/followup/enroll", () => ({
  enrollFollowupFlow: vi.fn(async () => desfechoDaInscricao),
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

const ORG = "f5f5f5f5-0000-4000-8000-000000000001";
const NUMERO = "f5f5f5f5-0000-4000-8000-000000000002";
const FLUXO = "f5f5f5f5-0000-4000-8000-000000000003";
let seq = 0;
const id = (p: string) => `f5f5f5f5-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

async function conversaNova() {
  const contato = id("2222");
  const conversa = id("3333");
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'Cliente', $3)`,
    [contato, ORG, `+55419${String(seq).padStart(8, "0")}`],
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

const FUNIL = "f5f5f5f5-5555-4000-8000-000000000001";
const ETAPA = "f5f5f5f5-5555-4000-8000-000000000002";
const ATIVO = "f5f5f5f5-6666-4000-8000-000000000001";
const INATIVO = "f5f5f5f5-6666-4000-8000-000000000002";

async function fluxo(nodes: unknown[], edges: unknown[]) {
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, 'Cards', 'active', true, $3::jsonb)
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
const notas = async (conversa: string) =>
  (
    await pool.query<{ body: string }>(
      `select body from conversation_notes where conversation_id = $1`,
      [conversa],
    )
  ).rows.map((r) => r.body);

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-cards', 'chatbot-cards', 'chatbot-cards', 'America/Sao_Paulo') on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'cards-numero', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [NUMERO, ORG],
  );
  await pool.query(
    `insert into crm_pipelines (id, organization_id, name, slug) values ($1, $2, 'Vendas', 'cards-vendas')
     on conflict do nothing`,
    [FUNIL, ORG],
  );
  await pool.query(
    `insert into crm_stages (id, organization_id, pipeline_id, name, slug, position)
     values ($1, $2, $3, 'Proposta', 'proposta', 1) on conflict do nothing`,
    [ETAPA, ORG, FUNIL],
  );
  await pool.query(
    `insert into catalog_products (id, organization_id, codigo, nome, descricao, preco_cents, ativo)
     values ($1, $3, 'BOLO-1', 'Bolo de cenoura', 'Com cobertura de chocolate', 4990, true),
            ($2, $3, 'BOLO-2', 'Bolo antigo', null, 1000, false)
     on conflict do nothing`,
    [ATIVO, INATIVO, ORG],
  );
});

beforeEach(() => {
  enviadas.length = 0;
  pedidos.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("Etapa do funil (executor)", () => {
  const grafo = () =>
    fluxo(
      [
        no("i", "inicio_canal"),
        no("f", "etapa_do_funil", { pipeline_id: FUNIL, etapas: [ETAPA] }),
        no("s", "enviar_mensagem", { texto: "Já está em proposta" }),
        no("n", "enviar_mensagem", { texto: "Ainda não" }),
      ],
      [liga("i", "f"), liga("f", "s", "sim"), liga("f", "n", "nao")],
    );

  it("negócio aberto do contato na etapa: Está", async () => {
    await grafo();
    const c = await conversaNova();
    await pool.query(
      `insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title)
       values ($1, $2, $3, $4, 'Negócio')`,
      [ORG, FUNIL, ETAPA, c.contato],
    );
    await chega(c, "oi");
    expect(enviadas).toEqual(["Já está em proposta"]);
  });

  it("negócio fechado, ou de outro contato, não conta: Não está", async () => {
    await grafo();
    const c = await conversaNova();
    const outro = await conversaNova();
    await pool.query(
      `insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, status, closed_at)
       values ($1, $2, $3, $4, 'Ganho', 'won', now()), ($1, $2, $3, $5, 'Do outro', 'open', null)`,
      [ORG, FUNIL, ETAPA, c.contato, outro.contato],
    );
    await chega(c, "oi");
    expect(enviadas).toEqual(["Ainda não"]);
  });
});

describe("Enviar produto e Enviar contato (executor)", () => {
  it("produto ativo sai com nome, preço e descrição lidos agora", async () => {
    await fluxo(
      [
        no("i", "inicio_canal"),
        no("p", "enviar_produto", { produto_id: ATIVO, mensagem: "Olha:" }),
      ],
      [liga("i", "p")],
    );
    await pool.query(`update catalog_products set preco_cents = 5490 where id = $1`, [ATIVO]);
    const c = await conversaNova();
    await chega(c, "oi");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]!.type).toBe("text"); // sem foto no Catálogo: sai como texto
    expect(pedidos[0]!.body).toContain("*Bolo de cenoura*");
    expect(pedidos[0]!.body).toMatch(/54,90/);
    expect(pedidos[0]!.body).toContain("Com cobertura de chocolate");
    expect(pedidos[0]!.body?.startsWith("Olha:")).toBe(true);
  });

  it("produto desativado não sai e a equipe lê uma nota", async () => {
    await fluxo(
      [no("i", "inicio_canal"), no("p", "enviar_produto", { produto_id: INATIVO })],
      [liga("i", "p")],
    );
    const c = await conversaNova();
    await chega(c, "oi");
    expect(pedidos).toEqual([]);
    expect((await notas(c.conversa)).join(" ")).toMatch(/desativado ou foi apagado/);
  });

  it("contato sai como cartão de contato", async () => {
    await fluxo(
      [
        no("i", "inicio_canal"),
        no("k", "enviar_contato", { nome: "Financeiro", telefone: "11987654321" }),
      ],
      [liga("i", "k")],
    );
    const c = await conversaNova();
    await chega(c, "oi");
    expect(pedidos).toEqual([
      {
        conversation_id: c.conversa,
        type: "contact",
        metadata: { shared_contact: { name: "Financeiro", phone_number: "11987654321" } },
      },
    ]);
  });
});

describe("Iniciar follow-up (executor)", () => {
  const FOLLOWUP = "f5f5f5f5-7777-4000-8000-000000000001";
  beforeAll(async () => {
    await pool.query(
      `insert into followup_flow_pointers (id, organization_id, name, status)
       values ($1, $2, 'Recuperar orçamento', 'draft') on conflict do nothing`,
      [FOLLOWUP, ORG],
    );
  });
  const grafo = () =>
    fluxo([no("i", "inicio_canal"), no("f", "iniciar_followup", { pointer_id: FOLLOWUP })], [liga("i", "f")]);

  it.each([
    [{ ok: true } as const, /pôs o contato no follow-up "Recuperar orçamento"/],
    [
      { ok: false, code: "flow_not_active", message: "Fluxo não está ativo.", status: 422 } as const,
      /"Recuperar orçamento", mas ele não está publicado/,
    ],
    [
      { ok: false, code: "conflict", message: "já tem", status: 409 } as const,
      /já está em outro follow-up ativo/,
    ],
    [
      { ok: false, code: "internal_error", message: "relation x does not exist", status: 500 } as const,
      /não conseguiu pôr o contato no follow-up "Recuperar orçamento"\.$/,
    ],
  ])("desfecho %#: a equipe lê uma nota", async (desfecho, esperado) => {
    desfechoDaInscricao = desfecho;
    await grafo();
    const c = await conversaNova();
    await chega(c, "oi");
    const lidas = await notas(c.conversa);
    expect(lidas.some((n) => esperado.test(n))).toBe(true);
    // Erro de banco não vai para a nota.
    expect(lidas.join(" ")).not.toMatch(/relation x/);
  });
});
