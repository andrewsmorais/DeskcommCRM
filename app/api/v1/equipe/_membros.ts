/**
 * Quem é da equipe AGORA (membro ativo da organização), com o nome para a
 * tela. Service role com o filtro da organização vindo da sessão — a RLS de
 * `user_organizations` só mostra o próprio vínculo a quem não é gerente.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type MembroDaEquipe = { user_id: string; nome: string; desde: string };

export async function membrosDaEquipe(orgId: string): Promise<MembroDaEquipe[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_organizations")
    .select("user_id, created_at")
    .eq("organization_id", orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  const linhas = (data ?? []) as Array<{ user_id: string; created_at: string }>;
  return Promise.all(
    linhas.map(async (m) => {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id).catch(() => ({ data: { user: null } }));
      const meta = (u.user?.user_metadata ?? {}) as Record<string, unknown>;
      const nome =
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        u.user?.email?.split("@")[0] ||
        "Pessoa da equipe";
      return { user_id: m.user_id, nome, desde: m.created_at };
    }),
  );
}
