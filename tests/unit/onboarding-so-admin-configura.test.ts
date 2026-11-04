/**
 * O assistente de configuração inicial é de quem ADMINISTRA a organização.
 *
 * `requireOnboardingCtx` devolvia o papel sem conferir, e as actions escrevem
 * com a service role. A auditoria reproduziu: um LEITOR emitia convite de
 * ADMIN para um e-mail seu (e recebia o link de aceite de volta), trocava a
 * memória da IA da organização e renomeava a empresa — efeitos que as portas
 * HTTP equivalentes (`POST /api/v1/team/invite`, `POST /api/v1/ai/memory`,
 * `updateTenant`) reservam ao admin.
 *
 * O teste fixa a régua no contexto, que toda action herda: leitor, atendente e
 * gerente recebem `forbidden` SEM nenhuma escrita; admin com MFA em dívida
 * também; admin com a sessão provada passa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  papel: "viewer",
  mfaEmDivida: false,
  escritas: [] as string[],
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => estado.mfaEmDivida),
  loadAuthUser: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "membro@qa.local",
    full_name: "Membro",
  })),
  resolveActiveOrg: vi.fn(async () => ({
    orgId: "22222222-2222-4222-8222-222222222222",
    name: "QA",
    role: estado.papel,
  })),
}));
vi.mock("@/lib/team/convites", () => ({
  emitirConvite: vi.fn(async () => {
    estado.escritas.push("convite");
    return { convite: { id: "c" }, accept_url: "https://x/convite", email_dispatched: false };
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      const encadeia = () => q;
      Object.assign(q, {
        select: encadeia,
        eq: encadeia,
        is: encadeia,
        update: () => {
          estado.escritas.push(`update:${tabela}`);
          return q;
        },
        insert: () => {
          estado.escritas.push(`insert:${tabela}`);
          return q;
        },
        maybeSingle: async () => ({
          data: { onboarding_state: {}, onboarded_at: null },
          error: null,
        }),
        then: (ok: (v: unknown) => unknown) => ok({ data: [], error: null }),
      });
      return q;
    },
  }),
}));

import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
import { sendOnboardingInvites } from "@/app/actions/onboarding/sendOnboardingInvites";

function boasVindas() {
  const f = new FormData();
  f.set("display_name", "Nome Trocado");
  f.set("timezone", "Asia/Tokyo");
  return f;
}

beforeEach(() => {
  estado.papel = "viewer";
  estado.mfaEmDivida = false;
  estado.escritas = [];
});

describe("assistente de configuração — só admin", () => {
  it.each(["viewer", "agent", "manager"])(
    "%s: convite de admin é recusado com forbidden e nada é escrito",
    async (papel) => {
      estado.papel = papel;
      const r = await sendOnboardingInvites({
        invitations: [{ email: "outra-conta@qa.local", role: "admin" }],
      });
      expect(r).toMatchObject({ ok: false, error: "forbidden" });
      expect(estado.escritas).toEqual([]);
    },
  );

  it("leitor não renomeia a organização pelas boas-vindas", async () => {
    const r = await acceptWelcome(boasVindas());
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    expect(estado.escritas).toEqual([]);
  });

  it("admin com MFA em dívida também é recusado", async () => {
    estado.papel = "admin";
    estado.mfaEmDivida = true;
    const r = await acceptWelcome(boasVindas());
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    expect(estado.escritas).toEqual([]);
  });

  it("admin com a sessão provada passa (controle positivo)", async () => {
    estado.papel = "admin";
    await acceptWelcome(boasVindas());
    expect(estado.escritas).toContain("update:organizations");
  });
});
