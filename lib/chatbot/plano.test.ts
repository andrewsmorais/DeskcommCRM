import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing", () => ({ canUse: vi.fn(), getOrganizationBilling: vi.fn() }));
vi.mock("@/lib/billing/acesso", () => ({ verificarRecursoDoPlano: vi.fn() }));

import type { Grafo } from "./passos";
import { verificarRecursoDoPlano } from "@/lib/billing/acesso";
import {
  conferirPassosDoPlano,
  disputamNumero,
  numerosDoFluxo,
  usaDistribuicaoAutomatica,
  usaPassoAvancado,
} from "./plano";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function fluxo(...nos: { type: string; data?: Record<string, unknown> }[]): Grafo {
  return {
    nodes: nos.map((n, i) => ({
      id: `n${i}`,
      type: n.type,
      position: { x: 0, y: 0 },
      data: n.data ?? {},
    })),
    edges: [],
  };
}
const noNumero = (id: string | null) => ({
  type: "inicio_canal",
  data: { channel_session_id: id },
});

describe("um chatbot de entrada por número", () => {
  it("fluxos em números diferentes não disputam — os dois ficam ligados", () => {
    expect(disputamNumero(fluxo(noNumero(A)), fluxo(noNumero(B)))).toBe(false);
  });
  it("mesmo número disputa", () => {
    expect(disputamNumero(fluxo(noNumero(A)), fluxo(noNumero(A), noNumero(B)))).toBe(true);
  });
  it("'qualquer número' disputa com todos", () => {
    expect(numerosDoFluxo(fluxo(noNumero(null)))).toBe("todos");
    expect(disputamNumero(fluxo(noNumero(null)), fluxo(noNumero(B)))).toBe(true);
  });
  it("fluxo só de automação ou manual não disputa número nenhum", () => {
    expect(disputamNumero(fluxo({ type: "inicio_manual" }), fluxo(noNumero(null)))).toBe(false);
  });
});

describe("chatbot avançado (Impulso)", () => {
  it("os passos básicos do Essencial não são avançados", () => {
    expect(
      usaPassoAvancado(
        fluxo(
          noNumero(A),
          { type: "enviar_mensagem" },
          { type: "pedir_escolher" },
          { type: "horarios" },
          { type: "transferir_equipe" },
          { type: "editar_etiquetas" },
          { type: "agendar_horario" },
          { type: "negocio_funil" },
          { type: "pedir_avaliacao" },
          { type: "finalizar_conversa" },
          // Decisão do dono (03/11/2026): follow-up no chatbot em todos os planos.
          { type: "iniciar_followup" },
        ),
      ),
    ).toBe(false);
  });
  it.each([
    "webhook",
    "aguardar_intervalo",
    "acionar_fluxo",
    "bloquear_contato",
    "tem_etiqueta",
    "inicio_automacao",
  ])("%s é do Chatbot avançado", (tipo) => {
    expect(usaPassoAvancado(fluxo(noNumero(A), { type: tipo }))).toBe(true);
  });
});

describe("transferir com distribuição automática é recurso do plano (Impulso)", () => {
  const transferir = (modo: string) => ({ type: "transferir_atendente", data: { modo } });
  const semRecurso = { ok: false, code: "billing_feature", status: 403, message: "fora do plano" } as const;

  it("rodízio e menos conversas distribuem; específico e quem atendeu antes não", () => {
    expect(usaDistribuicaoAutomatica(fluxo(transferir("rodizio")))).toBe(true);
    expect(usaDistribuicaoAutomatica(fluxo(transferir("menos_conversas")))).toBe(true);
    expect(usaDistribuicaoAutomatica(fluxo(transferir("especifico")))).toBe(false);
    expect(usaDistribuicaoAutomatica(fluxo(transferir("anterior")))).toBe(false);
    // Fluxo salvo antes dos modos não tem `modo` e segue como "específico".
    expect(usaDistribuicaoAutomatica(fluxo({ type: "transferir_atendente" }))).toBe(false);
  });

  it("Essencial: gravar rodízio é recusado com billing_feature", async () => {
    vi.mocked(verificarRecursoDoPlano).mockImplementation(async (_org, recurso) =>
      recurso === "distribuicao_automatica" ? semRecurso : { ok: true },
    );
    expect(await conferirPassosDoPlano("org", fluxo(transferir("rodizio")))).toEqual(semRecurso);
    expect(await conferirPassosDoPlano("org", fluxo(transferir("especifico")))).toEqual({ ok: true });
  });

  it("Impulso: rodízio grava", async () => {
    vi.mocked(verificarRecursoDoPlano).mockResolvedValue({ ok: true });
    expect(await conferirPassosDoPlano("org", fluxo(transferir("menos_conversas")))).toEqual({ ok: true });
  });
});
