import { describe, expect, it } from "vitest";

import type { DadosDaOrganizacao, LinhaDeAssinatura } from "./avisos";
import { exclusaoLiberada, exclusaoLiberadaEm } from "./ciclo-de-vida";
import { executarExclusao, type CanaisDesconectados, type DependenciasDaExclusao } from "./exclusao";

const DIA = 86_400_000;
const FIM = new Date("2026-09-01T12:00:00Z");
const depois = (dias: number) => new Date(FIM.getTime() + dias * DIA);
const ORG = "11111111-1111-4111-8111-111111111111";

const linha = (status = "canceled", fim: Date = FIM): LinhaDeAssinatura => ({
  organization_id: ORG,
  status,
  current_period_end: fim.toISOString(),
  expires_at: null,
  canceled_at: null,
});

const avisadoNoCiclo = (fim: Date = FIM): DadosDaOrganizacao => ({
  nome: "Loja",
  redigida: false,
  estado: { fim: fim.toISOString(), avisos: { encerramento: fim.toISOString() } },
});

function montar(
  linhas: LinhaDeAssinatura[] | null,
  agora: Date,
  opts: {
    org?: DadosDaOrganizacao | null;
    emAberto?: boolean;
    canais?: CanaisDesconectados;
    pedidoId?: string | null;
  } = {},
) {
  const ordem: string[] = [];
  const auditados: { pedidoId: string }[] = [];
  const dep: DependenciasDaExclusao = {
    agora: () => agora,
    assinaturas: async () => linhas,
    organizacao: async () => (opts.org === undefined ? avisadoNoCiclo() : opts.org),
    pedidoEmAberto: async () => opts.emAberto ?? false,
    desconectarCanais: async () => {
      ordem.push("canais");
      return opts.canais ?? { desconectados: 1, oficiais: 0, falhou: false };
    },
    agendarAnonimizacao: async () => {
      ordem.push("pedido");
      return opts.pedidoId === undefined ? "pedido-1" : opts.pedidoId;
    },
    auditar: async (_o, a) => {
      ordem.push("auditoria");
      auditados.push({ pedidoId: a.pedidoId });
    },
  };
  return { dep, ordem, auditados };
}

describe("quando a exclusão fica liberada", () => {
  it("só depois de 30 dias + a folga de 2 — o mesmo instante em que o link expira", () => {
    expect(exclusaoLiberadaEm(FIM).toISOString()).toBe(depois(32).toISOString());
    expect(exclusaoLiberada(FIM, depois(31.99))).toBe(false);
    expect(exclusaoLiberada(FIM, depois(32))).toBe(true);
  });
});

describe("executarExclusao", () => {
  it("desconecta o WhatsApp ANTES de abrir o pedido, e audita uma vez", async () => {
    const m = montar([linha()], depois(32));
    const r = await executarExclusao(m.dep);
    expect(r.agendadas).toEqual([{ orgId: ORG, pedidoId: "pedido-1" }]);
    expect(m.ordem).toEqual(["canais", "pedido", "auditoria"]);
    expect(m.auditados).toHaveLength(1);
  });

  it("um dia antes da liberação não toca em nada — o link ainda vale", async () => {
    const m = montar([linha()], depois(31.5));
    const r = await executarExclusao(m.dep);
    expect(r.avaliadas).toBe(0);
    expect(m.ordem).toEqual([]);
  });

  it("assinatura active nunca é excluída, nem vencida há meses", async () => {
    const m = montar([linha("active")], depois(200));
    expect((await executarExclusao(m.dep)).avaliadas).toBe(0);
    expect(m.ordem).toEqual([]);
  });

  it("sem nenhum aviso entregue NÃO exclui: a pessoa nunca soube da data", async () => {
    const m = montar([linha()], depois(40), { org: { nome: "Loja", redigida: false, estado: null } });
    const r = await executarExclusao(m.dep);
    expect(r.semAviso).toBe(1);
    expect(m.ordem).toEqual([]);
  });

  it("aviso de um encerramento ANTERIOR não vale para este ciclo", async () => {
    const fimAntigo = new Date(FIM.getTime() - 90 * DIA);
    const m = montar([linha()], depois(40), { org: avisadoNoCiclo(fimAntigo) });
    const r = await executarExclusao(m.dep);
    expect(r.semAviso).toBe(1);
    expect(m.ordem).toEqual([]);
  });

  it("estado com o fim certo mas sem aviso gravado também não conta", async () => {
    const m = montar([linha()], depois(40), {
      org: { nome: "Loja", redigida: false, estado: { fim: FIM.toISOString(), avisos: {} } },
    });
    expect((await executarExclusao(m.dep)).semAviso).toBe(1);
    expect(m.ordem).toEqual([]);
  });

  it("organização já anonimizada é pulada", async () => {
    const m = montar([linha()], depois(40), { org: { ...avisadoNoCiclo(), redigida: true } });
    const r = await executarExclusao(m.dep);
    expect(r.avaliadas).toBe(0);
    expect(m.ordem).toEqual([]);
  });

  it("pedido em aberto segura a rodada — nunca dois pedidos em paralelo", async () => {
    const m = montar([linha()], depois(40), { emAberto: true });
    const r = await executarExclusao(m.dep);
    expect(r.emAndamento).toBe(1);
    expect(m.ordem).toEqual([]);
  });

  it("canal que não desconectou: não abre pedido, tenta amanhã", async () => {
    const m = montar([linha()], depois(40), { canais: { desconectados: 0, oficiais: 0, falhou: true } });
    const r = await executarExclusao(m.dep);
    expect(r.falhasDeCanal).toBe(1);
    expect(m.ordem).toEqual(["canais"]);
    expect(m.auditados).toHaveLength(0);
  });

  it("canal oficial não segura a anonimização, mas é contado para ação manual", async () => {
    const m = montar([linha()], depois(40), { canais: { desconectados: 0, oficiais: 1, falhou: false } });
    const r = await executarExclusao(m.dep);
    expect(r.agendadas).toHaveLength(1);
    expect(r.canaisOficiais).toBe(1);
  });

  it("pedido que não abriu: conta a falha e NÃO audita", async () => {
    const m = montar([linha()], depois(40), { pedidoId: null });
    const r = await executarExclusao(m.dep);
    expect(r.falhasAoAgendar).toBe(1);
    expect(m.auditados).toHaveLength(0);
  });

  it("simulação não desconecta, não abre pedido e não audita", async () => {
    const m = montar([linha()], depois(40));
    const r = await executarExclusao(m.dep, { simular: true });
    expect(r.simuladas).toEqual([{ orgId: ORG }]);
    expect(m.ordem).toEqual([]);
  });

  it("leitura das assinaturas falhou: declara e não faz nada", async () => {
    const m = montar(null, depois(40));
    const r = await executarExclusao(m.dep);
    expect(r.leituraFalhou).toBe(true);
    expect(m.ordem).toEqual([]);
  });

  it("rodada sem nada a fazer não audita (cron que não fez nada não é mutação)", async () => {
    const m = montar([], depois(40));
    const r = await executarExclusao(m.dep);
    expect(r.agendadas).toEqual([]);
    expect(m.auditados).toHaveLength(0);
  });
});
