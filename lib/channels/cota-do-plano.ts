import type { SupabaseClient } from "@supabase/supabase-js";
import { canUse, getOrganizationBilling } from "@/lib/billing";
import { comReservaDeCota, ErroDaReservaDeCota } from "@/lib/billing/reserva";

export const CANAIS_CONTADOS_NO_PLANO = ["waha", "meta_cloud", "zernio", "datafy"];

/**
 * Quantos WhatsApps a organização tem ocupando vaga do plano. É a MESMA conta
 * para a cota (que recusa o canal a mais) e para a tela de Plano e cobrança (que
 * mostra o uso): se cada uma montasse a sua, a tela poderia dizer "1 de 1" e a
 * cota deixar passar um segundo — ou o contrário. Canal arquivado não conta.
 */
export async function contarCanaisDoPlano(
  db: SupabaseClient,
  orgId: string,
): Promise<{ count: number | null; error: unknown }> {
  const { count, error } = await db
    .from("channel_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .in("provider", CANAIS_CONTADOS_NO_PLANO);
  return { count: count ?? null, error };
}

/** Mesma trava dos canais pareados; voz e redes sociais não são WhatsApps. */
export async function comCotaDeCanal<T>(
  db: SupabaseClient,
  orgId: string,
  existingId: string | null,
  operacao: () => Promise<T>,
  recusar: (message: string, status: number) => T,
): Promise<T> {
  try {
    return await comReservaDeCota(orgId, "whatsapp", async () => {
      if (existingId) {
        const { data, error } = await db
          .from("channel_sessions")
          .select("id")
          .eq("organization_id", orgId)
          .eq("id", existingId)
          .is("archived_at", null)
          .maybeSingle();
        if (error)
          return recusar("Não foi possível conferir a cota do plano. Tente novamente.", 503);
        if (data) return operacao(); // Trocar credencial de canal ativo não ocupa vaga nova.
      }
      const [leitura, contagem] = await Promise.all([
        getOrganizationBilling(orgId),
        contarCanaisDoPlano(db, orgId),
      ]);
      if (!leitura.ok || contagem.error || contagem.count === null)
        return recusar("Não foi possível conferir a cota do plano. Tente novamente.", 503);
      if (!canUse(leitura.billing, "whatsapp", contagem.count).ok)
        return recusar(
          "O plano não permite adicionar outro WhatsApp. Confira Plano e cobrança.",
          403,
        );
      return operacao();
    });
  } catch (error) {
    if (error instanceof ErroDaReservaDeCota) return recusar(error.message, error.status);
    throw error;
  }
}
