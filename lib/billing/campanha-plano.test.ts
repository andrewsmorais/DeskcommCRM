import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { recordSend } from "@/lib/agent-engine/pacing/store";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { audit } from "@/lib/audit";
import { rodarUmaRodadaDeCampanha } from "@/lib/campanhas/rodada";
import { verificarRecursoDoPlano } from "./acesso";

vi.mock("./acesso", () => ({ verificarRecursoDoPlano: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({
  getRequestPool: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock("@/lib/agent-engine/pacing/engine", () => ({
  decidePacing: () => ({ allow: true }),
  dayStartInTz: (agora: Date) => agora,
}));
vi.mock("@/lib/agent-engine/pacing/store", () => ({
  loadChannelKnobs: vi.fn(async () => ({ knobs: { timezone: "UTC" }, numberActivatedAt: null })),
  loadPacingState: vi.fn(async () => ({ sentToday: 0, lastSentAt: null })),
  recordSend: vi.fn(async () => undefined),
}));
vi.mock("@/lib/atendimento/origem", () => ({ beginServiceAtOrigin: vi.fn() }));
vi.mock("@/lib/campanhas/elegibilidade", () => ({
  motivoParaExcluir: () => null,
  recusouMarketing: () => false,
}));
vi.mock("@/lib/campanhas/exclusoes", () => ({ hashDoEndereco: () => "hash-fixture" }));
vi.mock("@/lib/campanhas/rodizio", () => ({
  poolDaCampanha: (principal: string) => [principal],
  escolherNumero: () => ({ sessionId: "canal", motivo: "principal" }),
}));
vi.mock("@/lib/campanhas/ritmo", () => ({
  podeMandarAgora: () => ({ pode: true }),
  proximaTentativa: () => null,
}));

const ORG = "org-da-campanha";
const AGORA = new Date("2026-10-16T12:00:00Z");
const CAMPANHA = {
  id: "campanha-1",
  organization_id: ORG,
  channel_session_id: "canal",
  name: "Campanha",
  message_body: "Olá!",
  content_version: 1,
  intervalo_segundos: null,
  janela_inicio_hora: null,
  janela_fim_hora: null,
  teto_diario: null,
  teto_horario: null,
};

interface Consulta {
  tabela: string;
  campos: string;
  alteracao?: Record<string, unknown>;
  filtros: Array<[string, unknown]>;
}

function banco({ pausaAplicada = true, erroNaPausa = false } = {}) {
  const consultas: Consulta[] = [];
  const tabelas: string[] = [];
  const from = (tabela: string) => {
    tabelas.push(tabela);
    const consulta: Consulta = { tabela, campos: "", filtros: [] };
    const resposta = () => {
      consultas.push(consulta);
      if (tabela === "organizations") return { data: [], error: null };
      if (tabela === "campaigns") {
        if (!consulta.alteracao) return { data: [CAMPANHA], error: null };
        if (consulta.alteracao.status === "paused")
          return {
            data: pausaAplicada ? [{ id: CAMPANHA.id }] : [],
            error: erroNaPausa ? { message: "Banco indisponível" } : null,
          };
        return { data: [], error: null };
      }
      if (tabela === "channel_sessions")
        return { data: { status: "WORKING", daily_message_limit: null }, error: null };
      if (tabela === "campaign_suppressions") return { data: null, error: null };
      if (tabela === "campaign_recipients") {
        if (consulta.alteracao?.status === "sending")
          return { data: [{ id: "destinatario" }], error: null };
        if (consulta.alteracao || consulta.campos === "sent_at") return { data: [], error: null };
        return {
          data: [
            {
              id: "destinatario",
              contact_id: "contato",
              recipient_address: "endereco-de-teste",
              rendered_body: null,
              contacts: {
                id: "contato",
                name: "Pessoa",
                phone_number: null,
                is_blocked: false,
                is_anonymized: false,
                consent: null,
              },
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    };
    const builder = {
      select: (campos: string) => {
        consulta.campos = campos;
        return builder;
      },
      update: (alteracao: Record<string, unknown>) => {
        consulta.alteracao = alteracao;
        return builder;
      },
      eq: (coluna: string, valor: unknown) => {
        consulta.filtros.push([coluna, valor]);
        return builder;
      },
      lte: () => builder,
      gte: () => builder,
      or: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => resposta(),
      then: (resolve: (valor: ReturnType<typeof resposta>) => unknown) =>
        Promise.resolve(resposta()).then(resolve),
    };
    return builder;
  };
  return { admin: { from } as unknown as SupabaseClient, consultas, tabelas };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verificarRecursoDoPlano).mockResolvedValue({ ok: true });
  vi.mocked(beginServiceAtOrigin).mockResolvedValue({ conversation_id: "conversa" } as Awaited<
    ReturnType<typeof beginServiceAtOrigin>
  >);
  vi.mocked(sendMessageHandler).mockResolvedValue({ id: "mensagem", status: "sent" } as Awaited<
    ReturnType<typeof sendMessageHandler>
  >);
});

function conferirSemEnvio(tabelas: string[]) {
  expect(tabelas).not.toContain("campaign_recipients");
  expect(getRequestPool).not.toHaveBeenCalled();
  expect(beginServiceAtOrigin).not.toHaveBeenCalled();
  expect(sendMessageHandler).not.toHaveBeenCalled();
  expect(recordSend).not.toHaveBeenCalled();
}

describe("o consumidor real de campanhas respeita a resposta comercial", () => {
  it("503 preserva a campanha para tentar depois e não toca na fila ou no envio", async () => {
    vi.mocked(verificarRecursoDoPlano).mockResolvedValue({
      ok: false,
      code: "billing_unavailable",
      status: 503,
      message: "Tente novamente",
    });
    const stub = banco();
    const resultado = await rodarUmaRodadaDeCampanha(stub.admin, AGORA);
    expect(resultado).toMatchObject({ enviadas: 0, pulados: 0, concluidas: 0 });
    expect(resultado.detalhe).toContain("billing_unavailable");
    expect(stub.consultas.filter((q) => q.alteracao?.status === "paused")).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
    expect(verificarRecursoDoPlano).toHaveBeenCalledWith(ORG, "campanhas");
    conferirSemEnvio(stub.tabelas);
  });

  it("403 pausa apenas a campanha da organização e registra a razão sem consumir destinatário", async () => {
    vi.mocked(verificarRecursoDoPlano).mockResolvedValue({
      ok: false,
      code: "billing_feature",
      status: 403,
      message: "Confira o plano",
    });
    const stub = banco();
    const resultado = await rodarUmaRodadaDeCampanha(stub.admin, AGORA);
    expect(resultado.detalhe).toContain("billing_feature");
    const pausas = stub.consultas.filter((q) => q.alteracao?.status === "paused");
    expect(pausas).toHaveLength(1);
    expect(pausas[0]?.filtros).toEqual([
      ["organization_id", ORG],
      ["id", CAMPANHA.id],
      ["status", "running"],
    ]);
    expect(audit).toHaveBeenCalledExactlyOnceWith({
      action: "campaign.paused",
      organizationId: ORG,
      resourceType: "campaign",
      resourceId: CAMPANHA.id,
      metadata: { reason: "billing_feature" },
    });
    conferirSemEnvio(stub.tabelas);
  });

  it("repetição de 403 sem nova pausa não duplica auditoria", async () => {
    vi.mocked(verificarRecursoDoPlano).mockResolvedValue({
      ok: false,
      code: "billing_inactive",
      status: 403,
      message: "Assinatura inativa",
    });
    const stub = banco({ pausaAplicada: false });
    await rodarUmaRodadaDeCampanha(stub.admin, AGORA);
    expect(audit).not.toHaveBeenCalled();
    conferirSemEnvio(stub.tabelas);
  });

  it("falha da gravação da pausa também não permite enviar", async () => {
    vi.mocked(verificarRecursoDoPlano).mockResolvedValue({
      ok: false,
      code: "billing_feature",
      status: 403,
      message: "Confira o plano",
    });
    const stub = banco({ erroNaPausa: true });
    expect((await rodarUmaRodadaDeCampanha(stub.admin, AGORA)).enviadas).toBe(0);
    expect(audit).not.toHaveBeenCalled();
    conferirSemEnvio(stub.tabelas);
  });

  it("controle positivo: plano permitido percorre a fila e chama o envio uma vez", async () => {
    const stub = banco();
    const resultado = await rodarUmaRodadaDeCampanha(stub.admin, AGORA);
    expect(resultado.enviadas).toBe(1);
    expect(stub.tabelas).toContain("campaign_recipients");
    expect(beginServiceAtOrigin).toHaveBeenCalledWith(stub.admin, ORG, "contato", "canal");
    expect(sendMessageHandler).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMessageHandler).mock.calls[0]?.[1]).toMatchObject({
      organization_id: ORG,
    });
    expect(recordSend).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });
});
