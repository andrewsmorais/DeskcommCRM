// @vitest-environment node
/**
 * Chatbot: salvar um fluxo LIGADO passa pela mesma validação de ligar, e ligar
 * um rascunho confere os passos do plano.
 *
 * Achados da auditoria funcional f01 (04/11/2026), na rota real
 * PATCH /api/v1/chatbot-flows/[id], com banco e auth simulados:
 *   1. O botão Salvar (e o Ctrl+S) manda `{name, grafo}` sem `is_active`, e a
 *      rota só validava quando o corpo trazia `is_active: true` — num fluxo
 *      ligado, mensagem vazia e menu sem pergunta iam direto para os clientes.
 *   2. No Essencial, gravar passo avançado era recusado, mas LIGAR um rascunho
 *      que já o tinha (montado no Impulso) passava.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FLUXO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Linha = { id: string; grafo: unknown; revisao: number; is_active: boolean };
const estado: { atual: Linha | null; updates: Record<string, unknown>[] } = {
  atual: null,
  updates: [],
};

function construtor() {
  let op: "select" | "update" = "select";
  let payload: Record<string, unknown> = {};
  let neq = false;
  const b: Record<string, unknown> = {};
  const fim = () => {
    if (op === "update") {
      estado.updates.push(payload);
      return { data: { ...estado.atual, ...payload }, error: null };
    }
    if (neq) return { data: [], error: null };
    return { data: estado.atual, error: null };
  };
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    in: () => b,
    neq: () => ((neq = true), b),
    update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), b),
    maybeSingle: async () => fim(),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(fim()).then(res, rej),
  });
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => construtor() }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    org: { orgId: ORG },
    user: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", is_platform_admin: false, support: null },
  }),
}));
vi.mock("@/lib/chatbot/segredos", () => ({
  cifrarSegredosDoGrafo: async (_a: unknown, g: unknown) => g,
}));
// Plano Essencial: o "Chatbot avançado" não está incluído.
vi.mock("@/lib/billing/acesso", () => ({
  verificarRecursoDoPlano: async () => ({
    ok: false,
    code: "billing_feature",
    status: 403,
    message: "Chatbot avançado está disponível a partir do plano Impulso.",
  }),
}));

const { PATCH } = await import("@/app/api/v1/chatbot-flows/[id]/route");

const pedido = (body: unknown) =>
  new Request(`http://localhost/api/v1/chatbot-flows/${FLUXO}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
const ctx = { params: Promise.resolve({ id: FLUXO }) };

const valido = {
  nodes: [
    { id: "ini", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    { id: "m", type: "enviar_mensagem", position: { x: 0, y: 100 }, data: { texto: "Olá!" } },
  ],
  edges: [{ id: "e1", source: "ini", target: "m", sourceHandle: "proximo" }],
};
// Meio editado: a mensagem apagada, um menu sem pergunta, um WebHook sem endereço, um "Acionar outro fluxo" sem fluxo.
const quebrado = {
  nodes: [
    { id: "ini", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    { id: "m", type: "enviar_mensagem", position: { x: 0, y: 100 }, data: { texto: "" } },
    { id: "q", type: "pedir_escolher", position: { x: 0, y: 200 }, data: { pergunta: "" } },
    { id: "z", type: "transferir_equipe", position: { x: 0, y: 300 }, data: {} },
  ],
  edges: [
    { id: "e1", source: "ini", target: "m", sourceHandle: "proximo" },
    { id: "e2", source: "m", target: "q", sourceHandle: "proximo" },
    { id: "e3", source: "q", target: "fantasma", sourceHandle: "opcao-0" },
  ],
};
const comAvancado = {
  nodes: [
    { id: "ini", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
    { id: "w", type: "aguardar_intervalo", position: { x: 0, y: 100 }, data: {} },
    { id: "m", type: "enviar_mensagem", position: { x: 0, y: 200 }, data: { texto: "Oi" } },
  ],
  edges: [
    { id: "e1", source: "ini", target: "w", sourceHandle: "proximo" },
    { id: "e2", source: "w", target: "m", sourceHandle: "proximo" },
  ],
};

beforeEach(() => {
  estado.updates = [];
});

describe("PATCH /api/v1/chatbot-flows/[id] — salvar ligado e ligar rascunho", () => {
  it("controle: LIGAR com desenho quebrado é recusado (422)", async () => {
    estado.atual = { id: FLUXO, grafo: quebrado, revisao: 3, is_active: false };
    const r = await PATCH(pedido({ is_active: true }), ctx);
    expect(r.status).toBe(422);
    expect(estado.updates).toHaveLength(0);
  });

  it("fluxo JÁ LIGADO + o corpo do botão Salvar ({name, grafo}) com desenho quebrado é recusado (422)", async () => {
    estado.atual = { id: FLUXO, grafo: valido, revisao: 3, is_active: true };
    const r = await PATCH(pedido({ name: "Atendimento", grafo: quebrado }), ctx);
    expect(r.status).toBe(422);
    expect(estado.updates).toHaveLength(0);
  });

  it("controle: fluxo ligado + desenho válido salva (200)", async () => {
    estado.atual = { id: FLUXO, grafo: valido, revisao: 3, is_active: true };
    const r = await PATCH(pedido({ name: "Atendimento", grafo: valido }), ctx);
    expect(r.status).toBe(200);
  });

  it("controle: rascunho DESLIGADO salva desenho incompleto (o editor salva no meio do trabalho)", async () => {
    estado.atual = { id: FLUXO, grafo: valido, revisao: 3, is_active: false };
    const r = await PATCH(pedido({ grafo: quebrado }), ctx);
    expect(r.status).toBe(200);
  });

  it("controle de plano: GRAVAR desenho com passo avançado no Essencial é recusado (403)", async () => {
    estado.atual = { id: FLUXO, grafo: valido, revisao: 1, is_active: false };
    const r = await PATCH(pedido({ grafo: comAvancado }), ctx);
    expect(r.status).toBe(403);
  });

  it("LIGAR (só is_active) um rascunho que já tem passo avançado é recusado no Essencial (403)", async () => {
    estado.atual = { id: FLUXO, grafo: comAvancado, revisao: 1, is_active: false };
    const r = await PATCH(pedido({ is_active: true }), ctx);
    expect(r.status).toBe(403);
    expect(estado.updates).toHaveLength(0);
  });
});
