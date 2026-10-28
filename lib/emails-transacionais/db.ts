/**
 * O banco dos e-mails de relacionamento, atrás de `DbDosEmails`.
 *
 * Service role: TODA consulta filtra `organization_id` — a organização vem da
 * linha do `event_log`, nunca do payload. O destinatário só existe se for
 * membro vivo (aceito e não revogado) DAQUELA organização.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssinaturaLida, DbDosEmails, Destinatario } from "@/lib/emails-transacionais/aplicar";

// O client tipado não conhece a tabela nova até `database.types.ts` ser
// regenerado; o corte é local a este arquivo.
type Admin = SupabaseClient;

export function criarDbDosEmails(admin: Admin): DbDosEmails {
  async function dadosDoUsuario(userId: string): Promise<Destinatario | null> {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const nome = typeof meta.full_name === "string" ? meta.full_name : null;
    return { userId, email: data.user.email, nome };
  }

  return {
    async destinatario(organizationId, userId) {
      const { data: membros, error } = await admin
        .from("user_organizations")
        .select("user_id, role, created_at")
        .eq("organization_id", organizationId)
        .not("accepted_at", "is", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`emails: leitura de membros falhou: ${error.message}`);
      const lista = membros ?? [];
      if (lista.length === 0) return null;

      if (userId) {
        // O user_id do payload só vale se for membro daqui.
        return lista.some((m) => m.user_id === userId) ? dadosDoUsuario(userId) : null;
      }
      const { data: org } = await admin
        .from("organizations")
        .select("created_by")
        .eq("id", organizationId)
        .maybeSingle();
      const dono = org?.created_by as string | null | undefined;
      const escolhido =
        lista.find((m) => m.user_id === dono) ?? lista.find((m) => m.role === "admin") ?? lista[0];
      return escolhido ? dadosDoUsuario(escolhido.user_id as string) : null;
    },

    async assinatura(organizationId): Promise<AssinaturaLida | null> {
      const { data, error } = await admin
        .from("subscriptions")
        .select(
          "plan_type, status, billing_cycle, contracted_amount_cents, expires_at, current_period_end, limites_personalizados",
        )
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`emails: leitura da assinatura falhou: ${error.message}`);
      return (data as AssinaturaLida | null) ?? null;
    },

    async ultimoPlano(organizationId) {
      const { data, error } = await admin
        .from("transactional_email_log")
        .select("plan_type")
        .eq("organization_id", organizationId)
        .not("plan_type", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`emails: leitura do livro falhou: ${error.message}`);
      return (data?.plan_type as string | null | undefined) ?? null;
    },

    async reservar(e) {
      const { error } = await admin.from("transactional_email_log").insert({
        organization_id: e.organizationId,
        dedupe_key: e.dedupeKey,
        tipo: e.tipo,
        plan_type: e.planType,
        user_id: e.userId,
      });
      if (!error) return "reservado";
      if (error.code === "23505") return "ja_registrado";
      throw new Error(`emails: reserva falhou: ${error.message}`);
    },

    async devolver(organizationId, dedupeKey) {
      await admin
        .from("transactional_email_log")
        .delete()
        .eq("organization_id", organizationId)
        .eq("dedupe_key", dedupeKey);
    },
  };
}
