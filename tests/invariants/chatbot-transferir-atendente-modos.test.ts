/**
 * "Transferir p/ atendente" com os modos da Umbler, contra o Postgres real e o
 * CÓDIGO REAL do executor (lib/chatbot/executar.ts):
 *   - quem atendeu antes: o último atendente que a conversa recebeu e que
 *     SEGUE na equipe — quem saiu é pulado, e outro número não conta;
 *   - sem ninguém para receber (ninguém atendeu antes, atendente fixo que saiu
 *     da equipe, ninguém disponível no rodízio, atribuição recusada): a
 *     conversa vai para a fila humana — IA calada, Aguardando — e a equipe
 *     lê o porquê numa nota interna. Antes, o passo simplesmente não fazia
 *     nada e a conversa ficava sem dono e sem robô;
 *   - rodízio sem lista respeita as regras da conversa (número e setor); com
 *     lista, a lista substitui as duas.
 *
 * Fora: quem está disponível (`loadEligibleAttendants`, dublê que registra o
 * escopo pedido — tem testes próprios) e a atribuição em si
 * (`fn_conversation_assign`, dublê que registra a chamada).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";

vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(async () => ({ status: "sent" })),
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

type Candidato = { userId: string; currentLoad: number; lastAssignedAt: number | null };
const disponiveis: { lista: Candidato[]; escopos: unknown[] } = { lista: [], escopos: [] };
vi.mock("@/lib/routing/eligibles", () => ({
  loadEligibleAttendants: vi.fn(async (_s: unknown, _o: string, _n: Date, escopo: unknown) => {
    disponiveis.escopos.push(escopo);
    return disponiveis.lista;
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

const atribuicoes: Array<{ conversa: string; para: string }> = [];
let recusar = false;
const admin = {
  rpc: async (nome: string, args: Record<string, string>) => {
    if (nome === "fn_conversation_assign") {
      if (recusar) return { error: { message: "conversa mudou de dono" } };
      atribuicoes.push({ conversa: args.p_conversation_id!, para: args.p_to_user_id! });
    }
    return { error: null };
  },
} as never;

const ORG = "f3f3f3f3-0000-4000-8000-000000000001";
const NUMERO = "f3f3f3f3-0000-4000-8000-000000000002";
const OUTRO_NUMERO = "f3f3f3f3-0000-4000-8000-000000000003";
const FLUXO = "f3f3f3f3-0000-4000-8000-000000000004";
const ANA = "f3f3f3f3-1111-4000-8000-000000000001";
const BETO = "f3f3f3f3-1111-4000-8000-000000000002";
const CAIO = "f3f3f3f3-1111-4000-8000-000000000003";
let seq = 0;
const id = (p: string) => `f3f3f3f3-${p}-4000-8000-${String(++seq).padStart(12, "0")}`;

async function conversaNova(numero = NUMERO) {
  const contato = id("2222");
  const conversa = id("3333");
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

/** Uma atribuição antiga na conversa (o histórico que "quem atendeu antes" lê). */
async function atendidaPor(conversa: string, userId: string, haMinutos: number) {
  await pool.query(
    `insert into conversation_assignment_events (organization_id, conversation_id, to_user_id, reason, created_at)
     values ($1, $2, $3, 'transfer', now() - make_interval(mins => $4))`,
    [ORG, conversa, userId, haMinutos],
  );
}

async function passo(data: Record<string, unknown>) {
  await pool.query(
    `update chatbot_flows set is_active = false where organization_id = $1 and id <> $2`,
    [ORG, FLUXO],
  );
  const grafo = {
    nodes: [
      { id: "i", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
      { id: "t", type: "transferir_atendente", position: { x: 0, y: 0 }, data },
    ],
    edges: [{ id: "i-t", source: "i", target: "t", sourceHandle: "proximo" }],
  };
  await pool.query(
    `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
     values ($1, $2, 'Transferir por modo', 'active', true, $3::jsonb)
     on conflict (id) do update set grafo = excluded.grafo, is_active = true`,
    [FLUXO, ORG, JSON.stringify(grafo)],
  );
}

async function chega(c: { contato: string; conversa: string; numero: string }) {
  const mid = id("4444");
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, body, sent_via, sent_at)
     values ($1, $2, $3, $4, $5, 'text', 'inbound', 'delivered', 'oi', 'external_device', now())`,
    [mid, ORG, c.conversa, c.numero, c.contato],
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

const notas = async (conversa: string) =>
  (
    await pool.query<{ body: string }>(
      `select body from conversation_notes where conversation_id = $1 order by created_at`,
      [conversa],
    )
  ).rows.map((r) => r.body);

/** Fila humana: IA calada e a passagem gravada como do chatbot. */
const naFila = async (conversa: string) =>
  (
    await pool.query<{ fila: boolean }>(
      `select bot_silenced_until = 'infinity' and last_handoff_reason = 'chatbot' as fila
         from conversations where id = $1`,
      [conversa],
    )
  ).rows[0]?.fila;

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, timezone)
     values ($1, 'chatbot-modos', 'chatbot-modos', 'chatbot-modos', 'America/Sao_Paulo') on conflict (id) do nothing`,
    [ORG],
  );
  for (const [sid, nome] of [
    [NUMERO, "modos-numero"],
    [OUTRO_NUMERO, "modos-outro-numero"],
  ]) {
    await pool.query(
      `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
       values ($1, $2, $3, 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
      [sid, ORG, nome],
    );
  }
  for (const [uid, papel, saiu] of [
    [ANA, "agent", false],
    [BETO, "agent", true],
    [CAIO, "viewer", false],
  ] as const) {
    await pool.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [
      uid,
      `modos-${uid.slice(-1)}@invariant.test`,
    ]);
    await pool.query(
      `insert into user_organizations (user_id, organization_id, role, accepted_at, revoked_at)
       values ($1, $2, $3, now(), case when $4 then now() end) on conflict do nothing`,
      [uid, ORG, papel, saiu],
    );
  }
});

beforeEach(() => {
  atribuicoes.length = 0;
  disponiveis.lista = [];
  disponiveis.escopos.length = 0;
  recusar = false;
});

afterAll(async () => {
  await pool.end();
});

describe("Transferir p/ atendente — quem atendeu antes", () => {
  it("volta para o último atendente que segue na equipe; quem saiu e leitor são pulados", async () => {
    await passo({ modo: "anterior" });
    const c = await conversaNova();
    await atendidaPor(c.conversa, ANA, 60);
    await atendidaPor(c.conversa, BETO, 30); // saiu da equipe
    await atendidaPor(c.conversa, CAIO, 10); // leitor não atende
    await chega(c);
    expect(atribuicoes).toEqual([{ conversa: c.conversa, para: ANA }]);
    expect(await notas(c.conversa)).toEqual([]);
  });

  it("atendimento em OUTRO número não conta: ninguém antes, a conversa vai para a fila", async () => {
    await passo({ modo: "anterior" });
    const noOutro = await conversaNova(OUTRO_NUMERO);
    await atendidaPor(noOutro.conversa, ANA, 5);
    const c = await conversaNova();
    await chega(c);
    expect(atribuicoes).toEqual([]);
    expect(await naFila(c.conversa)).toBe(true);
    expect((await notas(c.conversa)).join(" ")).toMatch(/quem atendeu este contato antes/);
  });
});

describe("Transferir p/ atendente — sem ninguém, a fila", () => {
  it("atendente fixo que saiu da equipe: fila e nota, não atribuição", async () => {
    await passo({ modo: "especifico", user_id: BETO });
    const c = await conversaNova();
    await chega(c);
    expect(atribuicoes).toEqual([]);
    expect(await naFila(c.conversa)).toBe(true);
    expect((await notas(c.conversa)).join(" ")).toMatch(/não faz mais parte da equipe/);
  });

  it("atendente fixo da equipe recebe direto", async () => {
    await passo({ modo: "especifico", user_id: ANA });
    const c = await conversaNova();
    await chega(c);
    expect(atribuicoes).toEqual([{ conversa: c.conversa, para: ANA }]);
  });

  it("atribuição recusada pelo banco: a conversa não fica sem ninguém", async () => {
    recusar = true;
    await passo({ modo: "especifico", user_id: ANA });
    const c = await conversaNova();
    await chega(c);
    expect(await naFila(c.conversa)).toBe(true);
  });

  it("rodízio sem ninguém disponível: fila e nota", async () => {
    await passo({ modo: "rodizio" });
    const c = await conversaNova();
    await chega(c);
    expect(atribuicoes).toEqual([]);
    expect(await naFila(c.conversa)).toBe(true);
    expect((await notas(c.conversa)).join(" ")).toMatch(/Ninguém da equipe estava disponível/);
  });
});

describe("Transferir p/ atendente — rodízio e menos conversas", () => {
  it("sem lista: pede quem pode receber ESTA conversa (número e setor)", async () => {
    disponiveis.lista = [{ userId: ANA, currentLoad: 0, lastAssignedAt: null }];
    await passo({ modo: "rodizio" });
    const c = await conversaNova();
    await chega(c);
    expect(disponiveis.escopos).toEqual([
      { kind: "conversation_channel", channelSessionId: NUMERO, setorId: null },
    ]);
    expect(atribuicoes).toEqual([{ conversa: c.conversa, para: ANA }]);
  });

  it("com lista: a lista substitui as regras do número, e só ela recebe", async () => {
    disponiveis.lista = [
      { userId: ANA, currentLoad: 4, lastAssignedAt: 1 },
      { userId: CAIO, currentLoad: 0, lastAssignedAt: null },
    ];
    await passo({ modo: "menos_conversas", atendentes: [ANA] });
    const c = await conversaNova();
    await chega(c);
    expect(disponiveis.escopos).toEqual([{ kind: "organization_summary" }]);
    expect(atribuicoes).toEqual([{ conversa: c.conversa, para: ANA }]);
  });
});
