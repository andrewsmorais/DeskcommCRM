import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationBilling } from "@/lib/billing";
import { assinaturaExigida } from "@/lib/billing/exigencia";
import { comReservaDeCota } from "./reserva";

export class ErroDaCotaDeEquipe extends Error {
  constructor(
    public readonly code: "billing_limit" | "billing_unavailable" | "billing_inactive",
    public readonly status: 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ErroDaCotaDeEquipe";
  }
}

export async function consultarCotaDaEquipe(db: SupabaseClient, orgId: string) {
  const [membros, convites, leitura] = await Promise.all([
    db
      .from("user_organizations")
      .select("user_id, role")
      .eq("organization_id", orgId)
      .is("revoked_at", null),
    db
      .from("team_invites")
      .select("email")
      .eq("organization_id", orgId)
      .is("revoked_at", null)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
    getOrganizationBilling(orgId),
  ]);
  if (membros.error || convites.error || !leitura.ok)
    throw new ErroDaCotaDeEquipe(
      "billing_unavailable",
      503,
      "Não foi possível conferir as vagas da equipe. Tente novamente.",
    );
  const humanos = (membros.data ?? []).filter((m) => m.role !== "ai_operator");
  const emailsAtivos = new Set<string>();
  for (const m of humanos) {
    const { data, error } = await db.auth.admin.getUserById(m.user_id);
    if (error)
      throw new ErroDaCotaDeEquipe(
        "billing_unavailable",
        503,
        "Não foi possível conferir os membros. Tente novamente.",
      );
    if (data.user?.email) emailsAtivos.add(data.user.email.trim().toLowerCase());
  }
  const reservas = new Set(
    (convites.data ?? [])
      .map((c) => c.email.trim().toLowerCase())
      .filter((e) => !emailsAtivos.has(e)),
  );
  return {
    billing: leitura.billing,
    ocupados: humanos.length,
    reservados: reservas.size,
    reservas,
    emailsAtivos,
  };
}

/** Reserva e aceite disputam a mesma trava de organização em todos os processos. */
export async function comCotaDeEquipe<T>(
  db: SupabaseClient,
  orgId: string,
  alvo: { userId?: string; email?: string },
  operacao: () => Promise<T>,
): Promise<T> {
  return comReservaDeCota(orgId, "atendentes", async () => {
    if (alvo.userId) {
      const { data, error } = await db
        .from("user_organizations")
        .select("id")
        .eq("organization_id", orgId)
        .eq("user_id", alvo.userId)
        .is("revoked_at", null)
        .maybeSingle();
      if (error)
        throw new ErroDaCotaDeEquipe(
          "billing_unavailable",
          503,
          "Não foi possível conferir o vínculo.",
        );
      if (data) return operacao(); // Replay de quem já ocupa a vaga, inclusive no downgrade.
    }
    if (!assinaturaExigida()) return operacao(); // Sem planos à venda, sem limite de atendentes.
    const cota = await consultarCotaDaEquipe(db, orgId);
    if (!cota.billing?.is_active)
      throw new ErroDaCotaDeEquipe(
        "billing_inactive",
        403,
        "Confira a assinatura em Plano e cobrança antes de ampliar a equipe.",
      );
    const email = alvo.email?.trim().toLowerCase();
    const jaReservado = Boolean(
      email && (cota.reservas.has(email) || cota.emailsAtivos.has(email)),
    );
    // Reserva própria não conta duas vezes. Redução de plano não apaga pessoas.
    if (!jaReservado && cota.ocupados + cota.reservados >= cota.billing.seats) {
      throw new ErroDaCotaDeEquipe(
        "billing_limit",
        403,
        `Você contratou ${cota.billing.seats} atendentes e as vagas estão ocupadas ou reservadas. Revogue um convite ou confira Plano e cobrança.`,
      );
    }
    if (cota.ocupados >= cota.billing.seats && alvo.userId) {
      throw new ErroDaCotaDeEquipe(
        "billing_limit",
        403,
        "Não há vaga para outro membro. Peça ao administrador para conferir Plano e cobrança.",
      );
    }
    return operacao();
  });
}
