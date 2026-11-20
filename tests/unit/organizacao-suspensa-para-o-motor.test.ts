/**
 * Organização suspensa pela plataforma: a IA, o chatbot e as automações param.
 *
 * Antes, a suspensão fechava a tela, a REST, o bearer e a escrita pela REST do
 * Supabase, mas o motor só parava quando a ASSINATURA vencia (e só com
 * `EXIGIR_ASSINATURA=true`): o agente seguia respondendo no WhatsApp de quem a
 * plataforma tinha suspendido. Decisão de 11/11/2026, no modelo da Umbler Talk
 * (conta suspensa não atende): a suspensão entra na régua única que o turno do
 * agente, o chatbot e as automações já consultam (`acessoPeloPlanoDaOrganizacao`),
 * com ou sem a camada comercial ligada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  status: "active" as string | null,
  erro: false,
  billing: { ok: true, billing: null } as unknown,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () =>
        estado.erro
          ? { data: null, error: { message: "indisponível" } }
          : { data: estado.status === null ? null : { status: estado.status }, error: null };
      return q;
    },
  }),
}));
vi.mock("@/lib/billing", () => ({ getOrganizationBilling: vi.fn(async () => estado.billing) }));

import { acessoPeloPlanoDaOrganizacao, exigirAssinaturaAtiva } from "@/lib/billing/acesso";

const ORG = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  estado.status = "active";
  estado.erro = false;
  estado.billing = { ok: true, billing: null };
  vi.unstubAllEnvs();
});

describe("suspensão no motor", () => {
  it("suspensa: bloqueia mesmo com a camada comercial DESLIGADA", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "false");
    estado.status = "suspended";
    expect(await acessoPeloPlanoDaOrganizacao(ORG)).toEqual({
      liberado: false,
      motivo: "suspensa",
    });
  });

  it("suspensa: bloqueia também com assinatura ativa", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    estado.status = "suspended";
    estado.billing = { ok: true, billing: { is_active: true, plan_slug: "impulso" } };
    expect(await acessoPeloPlanoDaOrganizacao(ORG)).toEqual({
      liberado: false,
      motivo: "suspensa",
    });
  });

  it("a rota de IA pela tela devolve 403 org_suspended", async () => {
    estado.status = "suspended";
    const res = await exigirAssinaturaAtiva(ORG);
    expect(res?.status).toBe(403);
    expect(((await res!.json()) as { error: { code: string } }).error.code).toBe("org_suspended");
  });

  it("leitura indisponível NÃO suspende (um soluço do banco não cala quem paga)", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "false");
    estado.erro = true;
    expect(await acessoPeloPlanoDaOrganizacao(ORG)).toEqual({
      liberado: true,
      motivo: "nao_exigido",
    });
  });

  it("o motor consulta pelo próprio pool (a prévia do agente não faz HTTP)", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "false");
    estado.status = "active"; // a REST diria ativa; quem decide é o pool
    const query = vi.fn(async () => ({ rows: [{ status: "suspended" }] }));
    expect(await acessoPeloPlanoDaOrganizacao(ORG, { query } as never)).toEqual({
      liberado: false,
      motivo: "suspensa",
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("from public.organizations"), [ORG]);
    query.mockRejectedValueOnce(new Error("pool fora"));
    expect(await acessoPeloPlanoDaOrganizacao(ORG, { query } as never)).toEqual({
      liberado: true,
      motivo: "nao_exigido",
    });
  });

  it("controle: organização ativa segue a régua de sempre", async () => {
    vi.stubEnv("EXIGIR_ASSINATURA", "false");
    expect(await acessoPeloPlanoDaOrganizacao(ORG)).toEqual({
      liberado: true,
      motivo: "nao_exigido",
    });
    vi.stubEnv("EXIGIR_ASSINATURA", "true");
    estado.billing = { ok: true, billing: { is_active: false, plan_slug: "essencial" } };
    expect(await acessoPeloPlanoDaOrganizacao(ORG)).toEqual({ liberado: false, motivo: "vencido" });
  });
});
