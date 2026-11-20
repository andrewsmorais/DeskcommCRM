/**
 * Configurações → Setores. Onde a organização divide a equipe em setores de
 * atendimento (Vendas, Suporte, Financeiro…) — migration 0496.
 *
 * Um setor é um grupo de atendentes. A conversa posta num setor (pela Inbox ou
 * pelo passo "Transferir para a equipe" do chatbot) só é distribuída a quem é
 * membro dele (lib/routing/eligibles.ts), e aparece marcada com o setor na
 * Inbox, onde dá para filtrar.
 *
 * `manager`, como Distribuição de atendimento e Tags: é configuração de quem
 * monta a operação, e é o mesmo papel que a RLS exige para gravar `setores`.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { listarSetores, type SetorComMembros } from "@/lib/setores/servico";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

import { PainelDeSetores } from "./_painel";

export const metadata = { title: "Setores" };
export const dynamic = "force-dynamic";

export default async function SetoresPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!roleAtLeast(activeOrg.role, "manager")) redirect("/403");

  const t = (texto: string) => traduzir(texto, user.idioma);
  const db = await createClient();

  let setores: SetorComMembros[] | null = null;
  try {
    setores = await listarSetores(db, activeOrg.orgId);
  } catch {
    setores = null;
  }
  const { data: pessoas } = await db
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", activeOrg.orgId)
    .is("revoked_at", null);
  const atendentes = (pessoas ?? []).filter((p) => p.role !== "viewer");
  const nomes = await nomesDosAtendentes(atendentes.map((p) => String(p.user_id)));

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Setores")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "Divida a equipe em setores, como Vendas e Suporte. A conversa posta num setor, pela Inbox ou pelo chatbot, só é entregue a quem é do setor.",
          )}
        </p>
      </header>

      {setores === null ? (
        // A falha não vira lista vazia: "nenhum setor" convidaria a criar de novo.
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {t("Não foi possível carregar os setores agora. Recarregue a página.")}
        </div>
      ) : (
        <PainelDeSetores
          setores={setores}
          atendentes={atendentes.map((p) => ({
            id: String(p.user_id),
            nome: nomes.get(String(p.user_id)) ?? `${String(p.user_id).slice(0, 8)} · ${p.role}`,
          }))}
        />
      )}
    </div>
  );
}
