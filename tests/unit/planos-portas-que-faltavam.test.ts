// @vitest-environment node
/**
 * Cada recurso do plano é cobrado em TODAS as portas que produzem o efeito —
 * não só na rota "principal". A auditoria de segurança achou portas laterais
 * que entregavam recurso do Impulso/Escala a quem tinha o Essencial:
 *
 *   - "Comandas e propostas": só a criação de comanda cobrava; faturar em lote,
 *     incluir/remover item, alterar e finalizar não;
 *   - "Marca própria" (multimarca): a action cobrava; a rota de upload do logo
 *     da organização, que grava o MESMO logo, não;
 *   - "Permissões avançadas": a rota de interface por membro cobrava; o convite,
 *     que grava a mesma interface na aceitação, não.
 *
 * Os chatbots (rodízio) e as ferramentas de proposta do agente têm os testes
 * deles em `lib/chatbot/plano.test.ts` e `lib/billing/ferramentas-do-plano.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    is_platform_admin: false,
    email: "admin@teste.local",
    full_name: "Admin",
  },
  plano: { ok: true } as unknown,
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  emitirConvite: vi.fn(),
}));
const ORG = "22222222-2222-4222-8222-222222222222";
const FORA_DO_PLANO = {
  ok: false,
  code: "billing_feature",
  status: 403,
  message: "O plano atual não inclui este recurso.",
} as const;

vi.mock("@/lib/billing/acesso", () => ({
  verificarRecursoDoPlano: vi.fn(async () => mocks.plano),
  exigirRecursoDoPlano: vi.fn(async () => {
    const p = mocks.plano as { ok: boolean; code?: string; message?: string; status?: number };
    return p.ok
      ? null
      : NextResponse.json({ error: { code: p.code, message: p.message } }, { status: p.status });
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => mocks.user,
  resolveActiveOrg: async () => ({ orgId: ORG, name: "Org", role: "admin" }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: mocks.user,
    org: { orgId: ORG, name: "Org", role: "admin" },
  }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(), isServiceRoleConfigured: () => true }));
vi.mock("@/lib/branding/instalacao", () => ({ invalidarMarcaDaInstalacao: vi.fn() }));
vi.mock("@/lib/team/convites", () => ({ emitirConvite: mocks.emitirConvite }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          is: async () => ({ data: [] }),
          maybeSingle: async () => ({ data: { settings: { branding: { logo_path: "org/x.png" } } } }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }),
}));

import { DELETE as apagarLogo, POST as enviarLogo } from "@/app/api/v1/marca/logo/route";
import { POST as convidar } from "@/app/api/v1/team/invite/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plano = { ok: true };
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.emitirConvite.mockResolvedValue({
    convite: { id: "c1" },
    accept_url: "https://crm.exemplo/convite/x",
    email_dispatched: false,
    email_error: null,
  });
});

function postLogo() {
  const form = new FormData();
  form.set("escopo", "organizacao");
  form.set(
    "file",
    new File(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          "base64",
        ),
      ],
      "logo.png",
      { type: "image/png" },
    ),
  );
  return enviarLogo(new NextRequest("http://localhost/api/v1/marca/logo", { method: "POST", body: form }));
}

function postConvite(interface_settings?: unknown) {
  return convidar(
    new NextRequest("http://localhost/api/v1/team/invite", {
      method: "POST",
      body: JSON.stringify({
        invitations: [{ email: "nova@teste.local", role: "agent", ...(interface_settings ? { interface_settings } : {}) }],
      }),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("Marca própria — upload do logo da organização", () => {
  it("Essencial: POST recusa com billing_feature, sem upload nem RPC", async () => {
    mocks.plano = FORA_DO_PLANO;
    const res = await postLogo();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("billing_feature");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("Escala: POST grava", async () => {
    expect((await postLogo()).status).toBe(200);
    expect(mocks.upload).toHaveBeenCalled();
  });

  it("apagar fica liberado mesmo fora do plano — quem desceu de plano tira a marca", async () => {
    mocks.plano = FORA_DO_PLANO;
    const res = await apagarLogo(
      new NextRequest("http://localhost/api/v1/marca/logo?escopo=organizacao", { method: "DELETE" }),
    );
    expect(res.status).not.toBe(403);
  });
});

describe("Permissões avançadas — convite com interface restrita", () => {
  it("Essencial: interface simplificada recusa ANTES de emitir qualquer convite", async () => {
    mocks.plano = FORA_DO_PLANO;
    const res = await postConvite({ preset: "simplificada" });
    expect(res.status).toBe(403);
    expect(mocks.emitirConvite).not.toHaveBeenCalled();
  });

  it("Essencial: convite sem interface (ou com a completa) segue livre", async () => {
    mocks.plano = FORA_DO_PLANO;
    expect((await postConvite()).status).toBeLessThan(400);
    expect((await postConvite({ preset: "completa" })).status).toBeLessThan(400);
    expect(mocks.emitirConvite).toHaveBeenCalledTimes(2);
  });

  it("Escala: interface simplificada emite", async () => {
    expect((await postConvite({ preset: "simplificada" })).status).toBeLessThan(400);
    expect(mocks.emitirConvite).toHaveBeenCalledTimes(1);
  });
});

describe("Comandas e propostas — toda porta que mexe em comanda cobra o plano", () => {
  // Estrutural de propósito: o comportamento de `requireRole({ plano })` já tem
  // teste próprio; o que faltava era a PORTA passar o plano. Estorno fica fora:
  // desfazer dinheiro de comanda antiga tem de seguir possível após um downgrade.
  const raiz = join(process.cwd(), "app/api/v1/financeiro/comandas");
  const portas = [
    "route.ts",
    "faturar-lote/route.ts",
    "pendentes/route.ts",
    "[id]/route.ts",
    "[id]/itens/route.ts",
    "[id]/itens/[itemId]/route.ts",
    "[id]/finalizar/route.ts",
  ];
  it.each(portas)("%s: toda chamada de requireRole com papel de escrita leva plano", (arquivo) => {
    const fonte = readFileSync(join(raiz, arquivo), "utf8");
    const chamadas = [...fonte.matchAll(/requireRole\("(agent|manager|admin)"[\s\S]*?\)/g)].map((m) => m[0]);
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) expect(c).toContain('plano: "comandas_e_propostas"');
  });
});
