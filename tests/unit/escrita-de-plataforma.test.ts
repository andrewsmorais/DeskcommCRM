/**
 * Auditoria de 18/11, achado 2: a rota de atualização do sistema aceitava
 * qualquer `is_platform_admin` — inclusive o escopo `support_readonly` e uma
 * sessão só com senha de quem tem verificação em duas etapas cadastrada — e o
 * pedido vira `update.sh` no host. `recusaDeEscritaDePlataforma` é a régua de
 * escrita de instância; estes casos fixam as três perguntas dela.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  linha: { scope: "full", mfa_required: false } as Record<string, unknown> | null,
  erro: null as { message: string } | null,
  aal: "aal1" as "aal1" | "aal2" | null,
  emDivida: false,
}));

vi.mock("@/lib/auth/server", () => ({
  sessionAal: async () => estado.aal,
  mfaEmDivida: async () => estado.emDivida,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q = {
      select: () => q,
      eq: () => q,
      is: () => q,
      maybeSingle: async () => ({ data: estado.linha, error: estado.erro }),
    };
    return { from: () => q };
  },
}));

import { recusaDeEscritaDePlataforma } from "@/lib/auth/escrita-de-plataforma";
import type { AuthUser } from "@/lib/auth/types";

const dono = { id: "u1", is_platform_admin: true, support: null, idioma: "pt-BR" } as unknown as AuthUser;

async function codigo(user: AuthUser = dono): Promise<string | null> {
  const r = await recusaDeEscritaDePlataforma(user, "atualizar");
  if (!r) return null;
  return ((await r.json()) as { error: { code: string } }).error.code;
}

beforeEach(() => {
  estado.linha = { scope: "full", mfa_required: false };
  estado.erro = null;
  estado.aal = "aal1";
  estado.emDivida = false;
});

describe("recusaDeEscritaDePlataforma", () => {
  it("dono com escopo full, sem fator e sem política: libera", async () => {
    expect(await codigo()).toBeNull();
  });

  it("quem não é dono de plataforma: 403 forbidden", async () => {
    expect(await codigo({ ...dono, is_platform_admin: false } as AuthUser)).toBe("forbidden");
  });

  it("modo suporte: 403 forbidden, mesmo sendo dono", async () => {
    expect(await codigo({ ...dono, support: { sessionId: "s" } } as unknown as AuthUser)).toBe(
      "forbidden",
    );
  });

  it("escopo support_readonly: 403 forbidden (só leitura)", async () => {
    estado.linha = { scope: "support_readonly", mfa_required: false };
    const r = await recusaDeEscritaDePlataforma(dono, "atualizar");
    expect(r?.status).toBe(403);
    const corpo = (await r!.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("somente leitura");
  });

  it("política exige MFA e a sessão é aal1: 403 mfa_required", async () => {
    estado.linha = { scope: "full", mfa_required: true };
    estado.aal = "aal1";
    expect(await codigo()).toBe("mfa_required");
  });

  it("política exige MFA e a sessão provou (aal2): libera", async () => {
    estado.linha = { scope: "full", mfa_required: true };
    estado.aal = "aal2";
    expect(await codigo()).toBeNull();
  });

  it("fator cadastrado e sessão só com senha (dívida de MFA): 403 mfa_required", async () => {
    estado.emDivida = true;
    expect(await codigo()).toBe("mfa_required");
  });

  it("linha revogada ou ausente: 403 forbidden", async () => {
    estado.linha = null;
    expect(await codigo()).toBe("forbidden");
  });

  it("falha ao ler a permissão: 503, nunca libera", async () => {
    estado.erro = { message: "boom" };
    const r = await recusaDeEscritaDePlataforma(dono, "atualizar");
    expect(r?.status).toBe(503);
  });
});
