/**
 * Configurações → Variáveis da empresa — o "Variáveis da organização" da Umbler
 * Talk: endereço, Pix, horário, link do catálogo guardados uma vez e usados em
 * qualquer mensagem do chatbot ou resposta rápida como {{empresa.chave}}.
 * Gerente ou acima, como as Configurações de conversas, que são a vizinha.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { lerVariaveisDaEmpresa } from "@/lib/empresa/variaveis";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { VariaveisForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function VariaveisDaEmpresaPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Variáveis da empresa", idioma)}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {traduzir(
            "Guarde uma vez o que se repete nas mensagens — endereço, chave Pix, horário, link do catálogo — e use {{empresa.nome_da_variavel}} nos chatbots e nas respostas rápidas. Mudou o valor aqui, muda em todas as mensagens.",
            idioma,
          )}
        </p>
      </header>
      <VariaveisForm initial={lerVariaveisDaEmpresa((data as { settings?: unknown } | null)?.settings)} />
    </div>
  );
}
