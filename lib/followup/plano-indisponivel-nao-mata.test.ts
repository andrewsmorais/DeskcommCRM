/**
 * LEITURA DO PLANO INDISPONÍVEL NÃO MATA O FOLLOW-UP.
 *
 * O motor confere o plano da organização a cada passo
 * (`verificarGrafoDoPlano`). Quando a LEITURA falhava (banco ou rede fora — o
 * 503 `billing_unavailable`), o motor lançava, e a exceção caía em
 * `applyHandlerFailure`: gastava uma tentativa e, passado `max_attempts`,
 * marcava o enrollment como morto. Com o backoff de 30s/1m/5m/15m/1h, pouco
 * mais de uma hora de banco fora apagava os follow-ups de quem paga.
 *
 * A falha não é DESTE follow-up: ele adia sem gastar tentativa, e anda quando o
 * plano volta a ser lido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const acesso = vi.hoisted(() => ({
  resposta: { ok: true } as
    | { ok: true }
    | { ok: false; code: string; message: string; status: 403 | 503 },
}));
vi.mock("@/lib/billing/grafo", () => ({
  verificarGrafoDoPlano: vi.fn(async () => acesso.resposta),
}));

import { ADIAMENTO_SEM_PLANO_MS, runFollowupTick, type AdminClient } from "./engine";
import type { FlowGraph } from "./graph-schema";
import type { EnrollmentRow } from "./node-handlers";

const INICIO = new Date("2026-10-22T12:00:00.000Z");
const INDISPONIVEL = {
  ok: false as const,
  code: "billing_unavailable",
  message: "Não foi possível confirmar o plano. Tente novamente em instantes.",
  status: 503 as const,
};

const GRAFO = {
  nodes: [{ id: "fim", type: "end", config: {} }],
  edges: [],
} as unknown as FlowGraph;

function loja() {
  let agora = INICIO;
  const enrollment: EnrollmentRow = {
    id: "enr-1",
    organization_id: "org-1",
    pointer_id: "ptr-1",
    version_id: "ver-1",
    contact_id: "contato-1",
    conversation_id: null,
    current_node_id: "fim",
    status: "active",
    next_eval_at: INICIO.toISOString(),
    claimed_until: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    steps_taken: 0,
    outcome: null,
    cancel_reason: null,
    started_at: INICIO.toISOString(),
    completed_at: null,
    updated_at: INICIO.toISOString(),
  };
  const avisos: string[] = [];
  const db = {
    async claimDueEnrollments() {
      const vencido = enrollment.next_eval_at !== null && Date.parse(enrollment.next_eval_at) <= agora.getTime();
      return vencido && (enrollment.status === "active" || enrollment.status === "waiting_reply") ? [{ ...enrollment }] : [];
    },
    async loadEnrollmentById() {
      return { ...enrollment };
    },
    async loadFlowGraph() {
      return GRAFO;
    },
    async loadLeadFacts() {
      return { lead_stage: null, tags: [] };
    },
    async loadEnrollmentEvents() {
      return [];
    },
    async loadLastInboundBody() {
      return null;
    },
    async insertEnrollmentEvent() {
      return { inserted: true };
    },
    async updateEnrollment(_id: string, _org: string, patch: Partial<EnrollmentRow>) {
      Object.assign(enrollment, patch);
    },
    async loadFlowPointerName() {
      return "Fluxo de teste";
    },
    async insertDeadInboxItem(item: { title: string }) {
      avisos.push(item.title);
    },
    async persistirRespostaFollowup() {
      /* sem captura de resposta */
    },
  } as unknown as AdminClient;

  return {
    enrollment,
    avisos,
    tick: () => runFollowupTick({ db, clock: () => agora, enqueueJob: async () => undefined }),
    avancaPara: (quando: Date) => {
      agora = quando;
    },
  };
}

beforeEach(() => {
  acesso.resposta = { ok: true };
});

describe("plano indisponível não mata o follow-up", () => {
  it("⭐ dez rodadas sem conseguir ler o plano — mais que max_attempts — e o enrollment segue vivo", async () => {
    const l = loja();
    acesso.resposta = INDISPONIVEL;

    for (let rodada = 0; rodada < 10; rodada++) {
      await l.tick();
      expect(l.enrollment.status, `rodada ${rodada}`).toBe("active");
      expect(l.enrollment.attempts, `rodada ${rodada}`).toBe(0);
      // Próxima avaliação: exatamente um adiamento depois do instante do tick.
      const proxima = Date.parse(l.enrollment.next_eval_at!);
      l.avancaPara(new Date(proxima));
    }

    expect(l.enrollment.last_error).toBe("billing_unavailable");
    // Indisponibilidade é infraestrutura, não pendência do cliente: nenhum aviso.
    expect(l.avisos).toEqual([]);
  });

  it("adia pelo tempo declarado, não pelo backoff de falha", async () => {
    const l = loja();
    acesso.resposta = INDISPONIVEL;
    await l.tick();
    expect(Date.parse(l.enrollment.next_eval_at!) - INICIO.getTime()).toBe(ADIAMENTO_SEM_PLANO_MS);
  });

  it("controle: quando o plano volta, o mesmo enrollment anda", async () => {
    const l = loja();
    acesso.resposta = INDISPONIVEL;
    await l.tick();
    l.avancaPara(new Date(Date.parse(l.enrollment.next_eval_at!)));

    acesso.resposta = { ok: true };
    await l.tick();
    expect(l.enrollment.status).toBe("completed");
  });
});
