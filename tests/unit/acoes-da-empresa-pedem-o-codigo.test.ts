/**
 * As server actions de administração da empresa que gravam pelo client de
 * serviço cobram, logo depois do papel, a prova do segundo fator
 * (`mfaEmDivida`) — a mesma régua de `updateMarcaDaOrganizacao` e
 * `apagarDadosOperacionaisDaOrganizacao`. Trazido do produto original
 * (d3dd42c5d), adaptado: aqui as actions conferem o papel direto.
 *
 * O client de serviço passa por cima da trava do banco (as políticas
 * `mfa_write_*` da 0500), então a única barreira para a sessão que só provou a
 * senha é esta. Server action é endpoint público — a tela não é o portão.
 *
 * Dois blocos: (1) cada action, chamada por um admin com a sessão devendo o
 * código, devolve `mfa_required` sem abrir client de banco — e, com a sessão em
 * dia, passa do portão (o controle que prova que é a guarda quem recusa); (2) a
 * varredura de `app/actions/**`, para a próxima action de admin que gravar pelo
 * client de serviço não nascer sem a régua.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { arquivosDeCodigo, caminhoRelativo } from "./helpers/varrer-codigo";

const ORG = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({ emDivida: true, clientes: 0 }));

/** Abrir client de banco é o primeiro efeito de toda action depois do portão. */
const PASSOU = "passou-do-portao";
function clienteQueAcusa(): never {
  h.clientes += 1;
  throw new Error(PASSOU);
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: vi.fn(), get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error(PASSOU);
  },
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({
  supportWriteError: () => null,
  authenticatedSessionId: async () => "sessao",
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    is_platform_admin: false,
    support: null,
    idioma: "pt-BR",
  }),
  resolveActiveOrg: async () => ({ orgId: ORG, role: "admin" }),
  mfaEmDivida: async () => h.emDivida,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: clienteQueAcusa }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteQueAcusa() }));
// connectNuvemshop: sem configuração, devolveria `not_configured` antes do client.
vi.mock("@/lib/nuvemshop/config", () => ({ getConfig: () => ({ appId: "1" }) }));
vi.mock("@/lib/nuvemshop/oauth", () => ({ buildAuthorizeUrl: () => "https://exemplo.test" }));
vi.mock("@/lib/auth/chave-de-assinatura", () => ({
  chaveDeAssinatura: () => {
    clienteQueAcusa();
  },
  ROTULOS_DE_ASSINATURA: { vinculoDaLoja: "x" },
}));

import { connectNuvemshop } from "@/app/actions/integrations/connectNuvemshop";
import { disconnectNuvemshop } from "@/app/actions/integrations/disconnectNuvemshop";
import { definirExigenciaDeMfa } from "@/app/actions/auth/politicaDeMfa";
import {
  atualizarBloqueioAteAssumir,
  atualizarInterfaceDaEmpresa,
} from "@/app/actions/settings/atualizarInterfaceDaEmpresa";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import { updateTenant } from "@/app/actions/settings/updateTenant";

type Resultado = { ok: boolean; error?: string; erro?: string } | void;

const ACOES: Array<[string, () => Promise<Resultado>]> = [
  ["connectNuvemshop", () => connectNuvemshop()],
  ["disconnectNuvemshop", () => disconnectNuvemshop()],
  ["definirExigenciaDeMfa", () => definirExigenciaDeMfa(true)],
  ["atualizarInterfaceDaEmpresa", () => atualizarInterfaceDaEmpresa({ preset: "completa" } as never)],
  ["atualizarBloqueioAteAssumir", () => atualizarBloqueioAteAssumir(true)],
  ["updatePipelineConfig", () => updatePipelineConfig("ffffffff-0000-4000-8000-00000000000f", {})],
  [
    "updateTenant",
    () =>
      updateTenant({
        display_name: "Loja",
        legal_name: "Loja SA",
        cnpj: null,
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        currency: "BRL",
        media_retention_days: 365,
        media_retention_enforced: true,
        dpo_email: null,
        privacy_policy_url: null,
      } as never),
  ],
];

const RECUSA_DE_MFA = /^mfa_required$|^Confirme o código/;

/** O código devolvido, ou `PASSOU` quando a action chegou ao primeiro efeito. */
async function desfecho(acao: () => Promise<Resultado>): Promise<string> {
  try {
    const r = await acao();
    if (!r) return "ok";
    return r.ok ? "ok" : String(r.error ?? r.erro);
  } catch (e) {
    return e instanceof Error && e.message === PASSOU ? PASSOU : `lançou: ${String(e)}`;
  }
}

beforeEach(() => {
  h.clientes = 0;
});

describe("admin da empresa devendo o código nesta sessão", () => {
  it.each(ACOES)("%s recusa pedindo o código, sem abrir client de banco", async (_nome, acao) => {
    h.emDivida = true;
    expect(await desfecho(acao)).toMatch(RECUSA_DE_MFA);
    expect(h.clientes).toBe(0);
  });

  it.each(ACOES)("CONTROLE: %s, com a sessão em dia, passa do portão", async (_nome, acao) => {
    h.emDivida = false;
    const r = await desfecho(acao);
    expect(r).not.toMatch(RECUSA_DE_MFA);
    expect(r).not.toMatch(/^lançou|forbidden|unauthenticated|auth_required/);
  });
});

describe("varredura: action de admin que grava pelo client de serviço cobra mfaEmDivida", () => {
  const acoes = arquivosDeCodigo(["app/actions"]).filter((f) => !/\.test\.tsx?$/.test(f));
  const PAPEL_DE_ADMIN = /ROLE_RANK\.admin|role !== "admin"|role === "admin"/;

  it("a varredura enxerga as actions (controle positivo)", () => {
    const deAdmin = acoes.filter((f) => {
      const c = readFileSync(f, "utf8");
      return PAPEL_DE_ADMIN.test(c) && c.includes("createAdminClient(");
    });
    expect(deAdmin.length).toBeGreaterThanOrEqual(8);
  });

  it("nenhuma action confere papel de admin e grava pelo client de serviço sem mfaEmDivida(", () => {
    const semRegua = acoes
      .filter((f) => {
        const c = readFileSync(f, "utf8");
        return (
          PAPEL_DE_ADMIN.test(c) &&
          c.includes("createAdminClient(") &&
          !c.includes("mfaEmDivida(") &&
          // O contexto do onboarding já cobra a régua (`_shared.ts`).
          !c.includes("requireOnboardingCtx(")
        );
      })
      .map(caminhoRelativo);
    expect(semRegua).toEqual([]);
  });
});
