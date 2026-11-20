/**
 * O TETO DIÁRIO DO ASSISTENTE DE AJUDA É CONTADO ANTES DA CHAMADA PAGA, E
 * FALHA FECHADO.
 *
 * ═══ O achado ═══
 *
 * POST /api/v1/ajuda contava as linhas de `ajuda_mensagens`, chamava o
 * Anthropic na chave da ajuda e SÓ DEPOIS gravava a linha — conferir-e-agir.
 * Pedidos simultâneos liam a mesma contagem abaixo do teto de 50 e todos
 * pagavam a chamada (medido: 60 de 60 respondidas, 60 chamadas pagas). E uma
 * gravação que falhava era engolida: 55 respostas, 0 linhas. Sem limitador por
 * pessoa ou por empresa, ao contrário da consulta paga do caso.
 *
 * ═══ O que se mede aqui ═══
 *
 * A rota de verdade, sobre um banco em memória que imita o recorte do
 * PostgREST usado por ela e pela reserva (`comReservaDeCota`, sobre
 * `idempotency_keys` com o índice único). Só o assistente (a chamada paga) e o
 * que monta o prompt são dublês.
 *
 *   1. Corrida no fim do dia: 49 usadas, 5 pedidos simultâneos → no máximo UMA
 *      chamada paga e a conta para em 50.
 *   2. A gravação da vaga falha → 503 e NENHUMA chamada paga.
 *   3. O limitador de rajada recusa → 429 sem tocar no banco nem no modelo.
 *   4. Controle: pedido comum responde, conta uma vaga e a linha recebe a
 *      resposta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  perguntar: vi.fn(),
  rateLimit: vi.fn(),
  banco: null as unknown as BancoFalso,
}));

interface Linha {
  [coluna: string]: unknown;
}

class BancoFalso {
  ajuda: Linha[] = [];
  reservas: Linha[] = [];
  falharInsertDaAjuda = false;
  private seq = 0;

  from(tabela: string) {
    return new Consulta(this, tabela);
  }
  novoId() {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
  }
}

/** O recorte do PostgREST que a rota e a reserva usam. Cede o laço a cada ida. */
class Consulta {
  private filtros: Array<(l: Linha) => boolean> = [];
  private acao: "select" | "insert" | "update" | "delete" = "select";
  private dados: Linha = {};
  private contar = false;

  constructor(
    private readonly banco: BancoFalso,
    private readonly tabela: string,
  ) {}

  private get linhas(): Linha[] {
    return this.tabela === "ajuda_mensagens" ? this.banco.ajuda : this.banco.reservas;
  }
  select(_c?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.contar = true;
    return this;
  }
  insert(dados: Linha) {
    this.acao = "insert";
    this.dados = dados;
    return this;
  }
  update(dados: Linha) {
    this.acao = "update";
    this.dados = dados;
    return this;
  }
  delete() {
    this.acao = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtros.push((l) => l[c] === v);
    return this;
  }
  gte(c: string, v: string) {
    this.filtros.push((l) => String(l[c]) >= v);
    return this;
  }
  lt(c: string, v: string) {
    this.filtros.push((l) => String(l[c]) < v);
    return this;
  }
  lte(c: string, v: string) {
    this.filtros.push((l) => String(l[c]) <= v);
    return this;
  }
  single() {
    return this.executar();
  }
  maybeSingle() {
    return this.executar();
  }
  then<A, B>(
    ok?: (v: { data: unknown; error: unknown; count?: number }) => A,
    erro?: (e: unknown) => B,
  ) {
    return this.executar().then(ok, erro);
  }

  private async executar(): Promise<{ data: unknown; error: unknown; count?: number }> {
    await new Promise((r) => setTimeout(r, 1));
    const casa = (l: Linha) => this.filtros.every((f) => f(l));
    if (this.acao === "insert") {
      if (this.tabela === "ajuda_mensagens" && this.banco.falharInsertDaAjuda) {
        return { data: null, error: { message: "disco cheio" } };
      }
      if (
        this.tabela === "idempotency_keys" &&
        this.linhas.some(
          (l) =>
            l.organization_id === this.dados.organization_id &&
            l.key === this.dados.key &&
            l.endpoint === this.dados.endpoint,
        )
      ) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const linha = {
        id: this.banco.novoId(),
        created_at: new Date().toISOString(),
        ...this.dados,
      };
      this.linhas.push(linha);
      return { data: { id: linha.id }, error: null };
    }
    const alvo = this.linhas.filter(casa);
    if (this.acao === "update") {
      for (const l of alvo) Object.assign(l, this.dados);
      return { data: alvo.map((l) => ({ id: l.id })), error: null };
    }
    if (this.acao === "delete") {
      for (const l of alvo) this.linhas.splice(this.linhas.indexOf(l), 1);
      return { data: null, error: null };
    }
    return this.contar
      ? { data: null, error: null, count: alvo.length }
      : { data: alvo, error: null };
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async () => ({
    ok: true,
    user: { id: "pessoa-1", is_platform_admin: false, idioma: "pt-BR" },
    org: { orgId: ORG, name: "Org", role: "viewer" },
  })),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/instalacao/config", () => ({
  valorDaInstalacao: vi.fn(async () => ({ valor: "sk-ant-chave-da-ajuda-0123456789" })),
}));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: vi.fn(async () => ({ nome: "Marca" })) }));
vi.mock("@/lib/ajuda/contexto", () => ({
  contatosDeSuporte: vi.fn(async () => ({ email: "", whatsapp: "" })),
  contextoDoCliente: vi.fn(async () => ({})),
}));
vi.mock("@/lib/ajuda/prompt", () => ({ parteFixa: () => "fixa", parteDoCliente: () => "cliente" }));
vi.mock("@/lib/ajuda/assistente", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  perguntarAoAssistente: h.perguntar,
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: h.rateLimit }));

const ORG = "17000000-0000-4000-8000-000000000001";

function pergunta(): Request {
  return new Request("http://localhost/api/v1/ajuda", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mensagem: "Como conecto o WhatsApp?" }),
  });
}

function semear(quantas: number) {
  const agora = new Date().toISOString();
  for (let i = 0; i < quantas; i++) {
    h.banco.ajuda.push({
      id: `antiga-${i}`,
      organization_id: ORG,
      pergunta: "p",
      resposta: "r",
      created_at: agora,
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  h.banco = new BancoFalso();
  h.rateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 6 });
  h.perguntar.mockImplementation(async () => {
    // A chamada paga demora: é nessa janela que a corrida acontecia.
    await new Promise((r) => setTimeout(r, 20));
    return {
      texto: "Abra Conexões e leia o QR.",
      escalou: false,
      uso: { entrada: 10, cache: 0, saida: 5 },
    };
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/v1/ajuda — o teto do dia", () => {
  it("corrida no fim do dia: 5 pedidos simultâneos com 49 usadas pagam no máximo UMA chamada", async () => {
    semear(49);
    const { POST } = await import("@/app/api/v1/ajuda/route");

    const respostas = await Promise.all(Array.from({ length: 5 }, () => POST(pergunta())));

    expect(h.perguntar).toHaveBeenCalledTimes(1);
    expect(h.banco.ajuda.filter((l) => l.organization_id === ORG)).toHaveLength(50);
    expect(respostas.filter((r) => r.status === 200)).toHaveLength(1);
    expect(respostas.filter((r) => r.status === 429)).toHaveLength(4);
    // A reserva foi devolvida: o próximo pedido do dia não fica preso no lease.
    expect(h.banco.reservas).toEqual([]);
  });

  it("com o teto atingido, recusa sem chamar o assistente", async () => {
    semear(50);
    const { POST } = await import("@/app/api/v1/ajuda/route");

    const res = await POST(pergunta());

    expect(res.status).toBe(429);
    expect(h.perguntar).not.toHaveBeenCalled();
  });

  it("gravação da vaga falha: 503 e NENHUMA chamada paga (falha fechado)", async () => {
    h.banco.falharInsertDaAjuda = true;
    const { POST } = await import("@/app/api/v1/ajuda/route");

    const res = await POST(pergunta());

    expect(res.status).toBe(503);
    expect(h.perguntar).not.toHaveBeenCalled();
  });

  it("rajada: o limitador por pessoa/empresa recusa antes do banco e do modelo", async () => {
    h.rateLimit.mockResolvedValue({ allowed: false, count: 7, limit: 6 });
    const { POST } = await import("@/app/api/v1/ajuda/route");

    const res = await POST(pergunta());

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(h.perguntar).not.toHaveBeenCalled();
    expect(h.banco.ajuda).toEqual([]);
    expect(h.rateLimit).toHaveBeenCalledWith(
      "ajuda:pessoa-1",
      expect.any(Number),
      expect.any(Number),
    );
    expect(h.rateLimit).toHaveBeenCalledWith(
      `ajuda-org:${ORG}`,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("controle: pedido comum responde, conta uma vaga e a linha recebe a resposta", async () => {
    semear(3);
    const { POST } = await import("@/app/api/v1/ajuda/route");

    const res = await POST(pergunta());

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { restantes: number } };
    expect(corpo.data.restantes).toBe(46);
    expect(h.perguntar).toHaveBeenCalledTimes(1);
    const nova = h.banco.ajuda.find((l) => String(l.id).startsWith("00000000"));
    expect(nova).toMatchObject({
      organization_id: ORG,
      user_id: "pessoa-1",
      pergunta: "Como conecto o WhatsApp?",
      resposta: "Abra Conexões e leia o QR.",
      tokens_saida: 5,
    });
  });

  it("o modelo falha depois da reserva: a vaga continua contada (a chamada pode ter custado)", async () => {
    h.perguntar.mockRejectedValue(new Error("timeout"));
    const { POST } = await import("@/app/api/v1/ajuda/route");

    const res = await POST(pergunta());

    expect(res.status).toBe(502);
    expect(h.banco.ajuda).toHaveLength(1);
  });
});
