/**
 * Shared helpers for onboarding Server Actions: resolve auth + active org +
 * admin client (we use service-role here because we do narrow targeted
 * UPDATEs scoped explicitly by `organization_id` resolved from the validated
 * session — no body-derived ids ever).
 */
import { supportWriteError } from "@/lib/impersonate/support";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingState } from "@/lib/schemas/onboarding";

export class OnboardingError extends Error {
  constructor(
    public readonly code:
      "auth_required" | "no_active_org" | "forbidden" | "not_found" | "db_error",
    message: string,
  ) {
    super(message);
    this.name = "OnboardingError";
  }
}

export interface OnboardingCtx {
  userId: string;
  orgId: string;
  orgName: string;
  role: string;
  fullName: string | null;
  email: string;
  /** Sessão dentro de um acompanhamento de suporte (a plataforma operando a conta). */
  emAcompanhamento: boolean;
}

export async function requireOnboardingCtx(): Promise<OnboardingCtx> {
  const user = await loadAuthUser();
  if (!user) throw new OnboardingError("auth_required", "Auth required.");
  if (supportWriteError(user.support))
    throw new OnboardingError("forbidden", "Acompanhamento somente leitura ou encerrado.");
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) throw new OnboardingError("no_active_org", "Sem organização ativa.");
  // ⚠️ O ASSISTENTE CONFIGURA A ORGANIZAÇÃO — é coisa de quem a administra.
  //
  // Este contexto devolvia o papel sem conferi-lo, e as actions escrevem com a
  // service role. Um leitor ou atendente (que o layout de /app também manda
  // para cá enquanto o onboarding não termina — e que alcança a action por POST
  // direto depois dele) emitia convite de ADMIN para um e-mail seu, trocava a
  // memória da IA da organização inteira e renomeava a empresa — três efeitos
  // que as portas HTTP equivalentes reservam ao admin. Agora a régua mora
  // AQUI, para toda action do assistente herdar, com a MFA provada como em
  // `requireRole`.
  if ((ROLE_RANK[activeOrg.role as Role] ?? 0) < ROLE_RANK.admin) {
    throw new OnboardingError(
      "forbidden",
      "Só quem administra a organização faz a configuração inicial.",
    );
  }
  if (await mfaEmDivida()) {
    throw new OnboardingError(
      "forbidden",
      "Confirme a verificação em duas etapas e tente de novo.",
    );
  }
  return {
    userId: user.id,
    orgId: activeOrg.orgId,
    orgName: activeOrg.name,
    role: activeOrg.role,
    fullName: user.full_name,
    email: user.email,
    emAcompanhamento: Boolean(user.support),
  };
}

export async function loadOnboardingState(orgId: string): Promise<{
  state: OnboardingState;
  onboardedAt: string | null;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("onboarding_state, onboarded_at")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new OnboardingError("db_error", error.message);
  if (!data) throw new OnboardingError("not_found", "Organização não encontrada.");
  return {
    state: (data.onboarding_state as OnboardingState | null) ?? {},
    onboardedAt: (data.onboarded_at as string | null) ?? null,
  };
}

export async function patchOnboardingState(
  orgId: string,
  patch: Partial<OnboardingState>,
  extra?: { display_name?: string; timezone?: string },
): Promise<void> {
  const admin = createAdminClient();
  const { state } = await loadOnboardingState(orgId);
  const merged: OnboardingState = { ...state, ...patch };
  const update: Record<string, unknown> = { onboarding_state: merged };
  if (extra?.display_name) update.display_name = extra.display_name;
  if (extra?.timezone) update.timezone = extra.timezone;
  const { error } = await admin.from("organizations").update(update).eq("id", orgId);
  if (error) throw new OnboardingError("db_error", error.message);
}
