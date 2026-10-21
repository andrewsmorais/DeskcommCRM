"use server";

/**
 * Server Action: bulk-invite teammates from the onboarding wizard.
 *
 * Reuses the canonical invite token + email template (EPIC-09) directly so
 * we don't pay the cost of a self-call to the API route. Failures to send
 * email do NOT block onboarding progression.
 */
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { emitirConvite } from "@/lib/team/convites";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErroDaCotaDeEquipe } from "@/lib/billing/equipe";
import { ErroDaReservaDeCota } from "@/lib/billing/reserva";
import { inviteOnboardingSchema } from "@/lib/schemas/onboarding";
import { requireOnboardingCtx, patchOnboardingState, OnboardingError } from "./_shared";

type PapelHumano = "viewer" | "agent" | "manager" | "admin";

export type SendInvitesResult =
  | {
      ok: true;
      sent: number;
      failed: number;
      /** Convites cujo email NÃO saiu (ex.: nenhum transporte configurado) — o link
       * de aceite é devolvido para o admin enviar manualmente. */
      undelivered?: { email: string; accept_url: string }[];
    }
  | {
      ok: false;
      error: "auth_required" | "no_active_org" | "invalid_input";
      message?: string;
      details?: unknown;
    };

interface InvitePayload {
  // Convite é para PESSOA: só papel humano. `ai_operator` não entra aqui de
  // propósito — é papel de token de agente, ninguém o recebe por e-mail.
  invitations: { email: string; role: PapelHumano }[];
  skip?: boolean;
}

export async function sendOnboardingInvites(payload: InvitePayload): Promise<SendInvitesResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code as never };
    throw err;
  }

  if (payload.skip) {
    await patchOnboardingState(ctx.orgId, { team: { invites_sent: 0, skipped: true } });
    await audit({
      action: "onboarding.team_invited",
      actorUserId: ctx.userId,
      organizationId: ctx.orgId,
      metadata: { skipped: true, count: 0 },
    });
    redirect("/onboarding");
  }

  let input;
  try {
    input = inviteOnboardingSchema.parse(payload);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: "invalid_input", details: err.flatten() };
    }
    throw err;
  }

  const inviterName = ctx.fullName ?? ctx.email ?? "Um colega";
  const admin = createAdminClient();

  let sent = 0;
  let failed = 0;
  const undelivered: { email: string; accept_url: string }[] = [];
  for (const inv of [
    ...new Map(input.invitations.map((inv) => [inv.email.trim().toLowerCase(), inv])).values(),
  ]) {
    const email = inv.email.trim().toLowerCase();
    try {
      const result = await emitirConvite(admin, {
        email,
        role: inv.role,
        organizationId: ctx.orgId,
        orgName: ctx.orgName,
        inviterId: ctx.userId,
        inviterName,
        requestId: randomUUID(),
      });
      if (result.email_dispatched) sent += 1;
      else {
        failed += 1;
        undelivered.push({ email, accept_url: result.accept_url });
      }
    } catch (error) {
      return {
        ok: false,
        error: "invalid_input",
        message:
          error instanceof ErroDaCotaDeEquipe || error instanceof ErroDaReservaDeCota
            ? error.message
            : "Não foi possível emitir o convite. Tente novamente.",
      };
    }
  }

  await patchOnboardingState(ctx.orgId, {
    team: { invites_sent: sent + failed, skipped: false },
  });
  await audit({
    action: "onboarding.team_invited",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    metadata: { count: sent + failed, sent, failed },
  });

  // Email falhou (ex.: VPS sem SMTP e sem Resend): NÃO redireciona em silêncio —
  // devolve os links de aceite pro admin enviar manualmente (mesmo contrato do
  // fallback de /app/team/invite). Redirect só no caminho 100% entregue.
  if (failed > 0) {
    return { ok: true, sent, failed, undelivered };
  }

  redirect("/onboarding");
}
