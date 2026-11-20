/**
 * Os blocos novos do chatbot contra o Postgres real, com o CÓDIGO REAL do
 * executor (lib/chatbot/executar.ts):
 *   - "Acionar outro fluxo": o fluxo A termina e o B começa no MESMO turno,
 *     com as respostas de A; B desligado deixa nota na conversa;
 *   - mensagem de espera da transferência: o relógio fica na sessão
 *     transferida, o drain manda a mensagem, e ela PARA quando uma pessoa da
 *     equipe responde;
 *   - "Enviar mídia": o arquivo do chatbot da org é copiado para a conversa e
 *     sai com a legenda; arquivo de outra org não sai;
 *   - "Agendar horário": oferece os horários da Agenda, marca o escolhido pelo
 *     handler da Agenda (com chave de idempotência) e confirma; horário pego na
 *     última hora oferece de novo;
 *   - "Negócio no funil": chama a regra única de pôr no funil.
 *
 * Fica de fora o que não é banco: o envio ao WhatsApp (espião), o Storage
 * (dublê de `copy`), a consulta/marcação da Agenda e a regra do funil (dublês
 * — os dois têm testes próprios), o plano e a janela de envio.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";

type Envio = { type?: string; body?: string; media_storage_path?: string; media_mime?: string };
const enviadas: Envio[] = [];
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: vi.fn(async (_admin: unknown, _ctx: unknown, input: Envio) => {
    enviadas.push(input);
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

const SLOTS = [
  { inicio: new Date("2026-11-03T12:00:00Z"), fim: new Date("2026-11-03T12:30:00Z") },
  { inicio: new Date("2026-11-04T17:00:00Z"), fim: new Date("2026-11-04T17:30:00Z") },
];
vi.mock("@/lib/agenda/consulta", () => ({
  horariosLivresDaOrg: vi.fn(async () => ({
    ok: true,
    slots: SLOTS,
    fusoDaRegra: "America/Sao_Paulo",
    publicouHorarios: true,
    fusoSuposto: false,
    fontesDefasadas: [],
    agendaExternaNuncaLida: false,
    googleCoberturaParcial: false,
  })),
}));
const marcacoes: { ctx: Record<string, unknown>; input: Record<string, unknown> }[] = [];
let recusarMarcacao: string | null = null;
vi.mock("@/app/api/v1/agenda/agendamentos/_handler", async () => {
  const { ApiError } = await import("@/lib/api/types");
  return {
    marcarAgendamentoHandler: vi.fn(async (_db: unknown, ctx: Record<string, unknown>, input: Record<string, unknown>) => {
      marcacoes.push({ ctx, input });
      if (recusarMarcacao) {
        const codigo = recusarMarcacao;
        recusarMarcacao = null;
        throw new ApiError(422, codigo, undefined, "t", "recusado");
      }
      return { id: "apt", status: "confirmed" };
    }),
  };
});
const funil: { ctx: Record<string, unknown>; contato: unknown; pipeline: string; etapa: string; opcoes: Record<string, unknown> }[] = [];
vi.mock("@/lib/leads/levar-ao-funil", () => ({
  levarContatoAoFunil: vi.fn(
    async (_db: unknown, ctx: Record<string, unknown>, contato: unknown, pipeline: string, etapa: string, opcoes: Record<string, unknown>) => {
      funil.push({ ctx, contato, pipeline, etapa, opcoes });
      return { ok: true, acao: "created", lead: { id: "lead" } };
    },
  ),
}));

import { atenderPeloChatbot, retomarChatbotPeloRelogio, type PedidoDeRetomada } from "@/lib/chatbot/executar";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const copias: { de: string; para: string }[] = [];
const admin = {
  storage: {
    from: () => ({
      copy: async (de: string, para: string) => {
        copias.push({ de, para });
        return { error: null };
      },
    }),
  },
} as never;

const ORG = "dededede-0000-4000-8000-000000000001";
const OUTRA_ORG = "dededede-0000-4000-8000-0000000000ff";
const SESSION = "dededede-0000-4000-8000-000000000003";
const FLUXO_A = "dededede-0000-4000-8000-0000000000a1";
const FLUXO_B = "dededede-0000-4000-8000-0000000000b1";
const TIPO = "dededede-0000-4000-8000-0000000000c1";
const FUNIL = "dededede-0000-4000-8000-0000000000d1";
const ETAPA = "dededede-0000-4000-8000-0000000000d2";
let seq = 0;
const id = (prefixo: string) => `dededede-${prefixo}-4000-8000-${String(++seq).padStart(12, "0")}`;

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

/** Uma conversa nova (com contato próprio) para cada caso: a regra das 6 horas não cruza casos. */
async function conversaNova(nome = "Cliente Teste"): Promise<{ contato: string; conversa: string }> {
  const contato = id("1111");
  const conversa = id("2222");
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number) values ($1, $2, $3, $4)`,
    [contato, ORG, nome, `+55119${String(seq).padStart(8, "0")}`],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'open', false)`,
    [conversa, ORG, contato, SESSION],
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
  return atenderPeloChatbot(
    pool,
    admin,
    { organizationId: ORG, conversationId: c.conversa, contactId: c.contato, channelSessionId: SESSION, inboundMessageId: mid },
    log,
  );
}

/** Só um fluxo de canal ligado por vez (como na tela): liga este e desliga os outros de canal. */
async function fluxoDeCanal(fid: string, grafo: unknown) {
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

const textos = () => enviadas.filter((e) => (e.type ?? "text") === "text").map((e) => e.body);

beforeAll(async () => {
  for (const [org, slug] of [
    [ORG, "chatbot-blocos"],
    [OUTRA_ORG, "chatbot-blocos-outra"],
  ]) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name, timezone)
       values ($1, $2, $3, $4, 'America/Sao_Paulo') on conflict (id) do nothing`,
      [org, slug, slug, slug],
    );
  }
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'chatbot-blocos', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [SESSION, ORG],
  );
});
beforeEach(() => {
  enviadas.length = 0;
  copias.length = 0;
  marcacoes.length = 0;
  funil.length = 0;
});
afterAll(() => pool.end());

describe("Acionar outro fluxo", () => {
  it("o fluxo B começa no mesmo turno, com as respostas de A, e cada um fica com a sua sessão", async () => {
    await pool.query(
      `insert into chatbot_flows (id, organization_id, name, status, is_active, grafo)
       values ($1, $2, 'Submenu', 'active', true, $3::jsonb) on conflict (id) do nothing`,
      [
        FLUXO_B,
        ORG,
        JSON.stringify({
          nodes: [no("auto", "inicio_automacao"), no("oi", "enviar_mensagem", { texto: "Oi {{nome}}, aqui é o submenu." })],
          edges: [liga("auto", "oi")],
        }),
      ],
    );
    await fluxoDeCanal(FLUXO_A, {
      nodes: [
        no("ini", "inicio_canal"),
        no("nome", "pedir_digitar", { pergunta: "Seu nome?", variavel: "nome" }),
        no("vai", "acionar_fluxo", { flow_id: FLUXO_B }),
      ],
      edges: [liga("ini", "nome"), liga("nome", "vai")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(await chega(c, "Ana")).toBe("atendeu");
    expect(textos()).toEqual(["Seu nome?", "Oi Ana, aqui é o submenu."]);

    const { rows } = await pool.query<{ flow_id: string; status: string; collected_data: Record<string, string> }>(
      `select flow_id, status, collected_data from chatbot_sessions where organization_id = $1 and conversation_id = $2 order by flow_id`,
      [ORG, c.conversa],
    );
    expect(rows).toEqual([
      { flow_id: FLUXO_A, status: "completed", collected_data: { nome: "Ana" } },
      { flow_id: FLUXO_B, status: "completed", collected_data: { nome: "Ana" } },
    ]);
  });

  it("fluxo chamado desligado: este termina e a conversa ganha uma nota dizendo por quê", async () => {
    await pool.query(`update chatbot_flows set is_active = false where id = $1`, [FLUXO_B]);
    await fluxoDeCanal(FLUXO_A, {
      nodes: [no("ini", "inicio_canal"), no("vai", "acionar_fluxo", { flow_id: FLUXO_B })],
      edges: [liga("ini", "vai")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(enviadas).toEqual([]);
    const { rows } = await pool.query<{ body: string }>(
      `select body from conversation_notes where organization_id = $1 and conversation_id = $2`,
      [ORG, c.conversa],
    );
    expect(rows.map((r) => r.body)).toEqual([
      "O chatbot tentou abrir outro fluxo, mas ele está desligado, não existe mais ou não tem passo de início.",
    ]);
  });
});

describe("Mensagem de espera da transferência", () => {
  const FLUXO = "dededede-0000-4000-8000-0000000000e1";

  async function eventoDaEspera(conversa: string) {
    const { rows } = await pool.query<{ payload: PedidoDeRetomada; next_attempt_at: string }>(
      `select payload, next_attempt_at from event_log
        where organization_id = $1 and event_type = 'chatbot.retomada_requested'
          and payload->>'conversation_id' = $2
        order by created_at desc, id desc limit 1`,
      [ORG, conversa],
    );
    return rows[0]!;
  }
  const venceAgora = (sessao: string) =>
    pool.query(`update chatbot_sessions set retomar_em = now() - interval '1 minute' where id = $1`, [sessao]);

  it("manda depois do intervalo, rearma até o limite, e para quando a equipe responde", async () => {
    await fluxoDeCanal(FLUXO, {
      nodes: [
        no("ini", "inicio_canal"),
        no("eq", "transferir_equipe", {
          mensagem: "Vou te passar para a equipe.",
          espera_minutos: 5,
          espera_mensagem: "Já já alguém te responde.",
          espera_vezes: 3,
        }),
      ],
      edges: [liga("ini", "eq")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(textos()).toEqual(["Vou te passar para a equipe."]);

    const s1 = (
      await pool.query<{ id: string; status: string; retomada_token: string | null; minutos: number }>(
        `select id, status, retomada_token, extract(epoch from (retomar_em - now()))/60 as minutos
           from chatbot_sessions where organization_id = $1 and conversation_id = $2`,
        [ORG, c.conversa],
      )
    ).rows[0]!;
    expect(s1.status).toBe("transferred");
    expect(s1.retomada_token).not.toBeNull();
    expect(Number(s1.minutos)).toBeGreaterThan(4);

    // Antes da hora: adia, não manda.
    const ev1 = await eventoDaEspera(c.conversa);
    expect(await retomarChatbotPeloRelogio(pool, admin, ev1.payload, ORG, log)).toMatchObject({ adiarAte: expect.anything() });

    await venceAgora(s1.id);
    expect(await retomarChatbotPeloRelogio(pool, admin, ev1.payload, ORG, log)).toBe("retomou");
    expect(textos().at(-1)).toBe("Já já alguém te responde.");
    // Replay do mesmo evento: o token já trocou, não manda de novo.
    expect(await retomarChatbotPeloRelogio(pool, admin, ev1.payload, ORG, log)).toBe("descartado");
    expect(textos()).toHaveLength(2);

    // Uma pessoa responde pelo CRM: a próxima espera desarma sem mandar nada.
    await pool.query(
      `insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
                             type, direction, status, body, sent_via, sent_at)
       values ($1, $2, $3, $4, 'text', 'outbound', 'sent', 'Oi! Sou a Bia.', 'user', now())`,
      [ORG, c.conversa, SESSION, c.contato],
    );
    const ev2 = await eventoDaEspera(c.conversa);
    expect(ev2.payload.token).not.toBe(ev1.payload.token);
    await venceAgora(s1.id);
    expect(await retomarChatbotPeloRelogio(pool, admin, ev2.payload, ORG, log)).toBe("descartado");
    expect(textos()).toHaveLength(2);
    const fim = (
      await pool.query<{ retomada_token: string | null; status: string }>(
        `select retomada_token, status from chatbot_sessions where id = $1`,
        [s1.id],
      )
    ).rows[0]!;
    expect(fim).toEqual({ retomada_token: null, status: "transferred" });
  });

  it("a mensagem do próprio chatbot não conta como resposta da equipe; a última vez não rearma", async () => {
    await fluxoDeCanal(FLUXO, {
      nodes: [
        no("ini", "inicio_canal"),
        no("eq", "transferir_equipe", { espera_minutos: 5, espera_mensagem: "Aguarde.", espera_vezes: 1 }),
      ],
      edges: [liga("ini", "eq")],
    });
    const c = await conversaNova();
    await chega(c, "oi");
    // Uma saída de automação (sent_via automation) depois da transferência.
    await pool.query(
      `insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
                             type, direction, status, body, sent_via, sent_at)
       values ($1, $2, $3, $4, 'text', 'outbound', 'sent', 'msg automática', 'automation', now())`,
      [ORG, c.conversa, SESSION, c.contato],
    );
    const ev = await eventoDaEspera(c.conversa);
    await venceAgora(ev.payload.session_id);
    expect(await retomarChatbotPeloRelogio(pool, admin, ev.payload, ORG, log)).toBe("retomou");
    expect(textos()).toEqual(["Aguarde."]);
    const s = (
      await pool.query<{ retomada_token: string | null; tentativas: number }>(
        `select retomada_token, tentativas from chatbot_sessions where id = $1`,
        [ev.payload.session_id],
      )
    ).rows[0]!;
    expect(s).toEqual({ retomada_token: null, tentativas: 1 });
  });
});

describe("Enviar mídia", () => {
  const FLUXO = "dededede-0000-4000-8000-0000000000f1";
  it("copia o arquivo do chatbot para a pasta da conversa e envia com a legenda", async () => {
    await fluxoDeCanal(FLUXO, {
      nodes: [
        no("ini", "inicio_canal"),
        no("foto", "enviar_midia", {
          storage_path: `${ORG}/chatbot/${FLUXO}/catalogo.pdf`,
          tipo: "document",
          mime: "application/pdf",
          legenda: "Nosso catálogo",
        }),
        no("fora", "enviar_midia", {
          storage_path: `${OUTRA_ORG}/chatbot/${FLUXO}/alheio.pdf`,
          tipo: "document",
          mime: "application/pdf",
        }),
      ],
      edges: [liga("ini", "foto"), liga("foto", "fora")],
    });
    const c = await conversaNova();
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(copias).toEqual([
      { de: `${ORG}/chatbot/${FLUXO}/catalogo.pdf`, para: `${ORG}/${c.conversa}/chatbot-catalogo.pdf` },
    ]);
    // Só o arquivo da própria organização sai.
    expect(enviadas).toEqual([
      {
        conversation_id: c.conversa,
        type: "document",
        media_storage_path: `${ORG}/${c.conversa}/chatbot-catalogo.pdf`,
        media_mime: "application/pdf",
        body: "Nosso catálogo",
      },
    ]);
  });
});

describe("Agendar horário", () => {
  const FLUXO = "dededede-0000-4000-8000-0000000000f2";
  const desenho = {
    nodes: [
      no("ini", "inicio_canal"),
      no("ag", "agendar_horario", { event_type_id: TIPO }),
      no("ok", "enviar_mensagem", { texto: "Anotado: {{horario}}." }),
    ],
    edges: [liga("ini", "ag"), liga("ag", "ok")],
  };

  it("oferece os horários da Agenda, marca o escolhido com chave de idempotência e confirma", async () => {
    await fluxoDeCanal(FLUXO, desenho);
    const c = await conversaNova();
    expect(await chega(c, "quero marcar")).toBe("atendeu");
    expect(textos()).toEqual([
      "Escolha um horário:\n\n1. terça-feira 03/11 às 09:00\n2. quarta-feira 04/11 às 14:00",
    ]);
    expect(await chega(c, "2")).toBe("atendeu");
    expect(marcacoes).toHaveLength(1);
    expect(marcacoes[0]!.input).toEqual({
      event_type_id: TIPO,
      starts_at: "2026-11-04T17:00:00.000Z",
      contact_id: c.contato,
      conversation_id: c.conversa,
    });
    expect(marcacoes[0]!.ctx).toMatchObject({
      organization_id: ORG,
      actor: { type: "webhook_source", id: `chatbot:${FLUXO}` },
      idempotencyKey: expect.stringContaining("2026-11-04T17:00:00.000Z"),
    });
    expect(textos().slice(1)).toEqual([
      "Pronto! Seu horário ficou marcado para quarta-feira 04/11 às 14:00. Até lá!",
      "Anotado: quarta-feira 04/11 às 14:00.",
    ]);
  });

  it("horário pego na última hora: avisa e oferece a lista de novo, sem marcar nada", async () => {
    await fluxoDeCanal(FLUXO, desenho);
    const c = await conversaNova();
    await chega(c, "quero marcar");
    recusarMarcacao = "agenda_horario_indisponivel";
    await chega(c, "1");
    expect(textos().slice(1)).toEqual([
      "Esse horário acabou de ser ocupado. Veja os que estão livres agora:",
      "Escolha um horário:\n\n1. terça-feira 03/11 às 09:00\n2. quarta-feira 04/11 às 14:00",
    ]);
    const s = (
      await pool.query<{ status: string; no_atual: string }>(
        `select status, no_atual from chatbot_sessions where organization_id = $1 and conversation_id = $2`,
        [ORG, c.conversa],
      )
    ).rows[0]!;
    expect(s).toEqual({ status: "waiting_input", no_atual: "ag" });
  });
});

describe("Negócio no funil", () => {
  const FLUXO = "dededede-0000-4000-8000-0000000000f3";
  it("chama a regra única de pôr no funil, com o nome do contato como título", async () => {
    await fluxoDeCanal(FLUXO, {
      nodes: [no("ini", "inicio_canal"), no("neg", "negocio_funil", { pipeline_id: FUNIL, stage_id: ETAPA })],
      edges: [liga("ini", "neg")],
    });
    const c = await conversaNova("Joana Prado");
    expect(await chega(c, "oi")).toBe("atendeu");
    expect(funil).toEqual([
      {
        ctx: expect.objectContaining({ organization_id: ORG, actor: { type: "webhook_source", id: `chatbot:${FLUXO}` } }),
        contato: { id: c.contato },
        pipeline: FUNIL,
        etapa: ETAPA,
        opcoes: { tituloNovo: "Joana Prado", source: "chatbot", quem: "pelo chatbot" },
      },
    ]);
  });
});
