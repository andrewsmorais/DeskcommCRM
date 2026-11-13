/**
 * Configurações → Conversas — o "Configurações de conversas" da Umbler Talk.
 *
 * Duas decisões da empresa que a tela de conversa obedece: a assinatura dos
 * atendentes e o que o botão Fechar faz. Gerente ou acima, como a Distribuição
 * de atendimento, que é a vizinha desta tela.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { lerPreferenciasDeConversa } from "@/lib/conversas/preferencias";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { ConversasForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function ConversasSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", activeOrg.orgId).maybeSingle();
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Conversas", idioma)}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {traduzir(
            "Defina o comportamento padrão das conversas: a assinatura dos atendentes e o que acontece ao fechar uma conversa.",
            idioma,
          )}
        </p>
      </header>
      <ConversasForm initial={lerPreferenciasDeConversa((data as { settings?: unknown } | null)?.settings)} />
    </div>
  );
}
