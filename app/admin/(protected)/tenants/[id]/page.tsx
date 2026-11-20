import { z } from "zod";

import { CartaoDaIaDoMolde, type IaDoMolde } from "@/components/admin/tenants/CartaoDaIaDoMolde";
import { loadAuthUser } from "@/lib/auth/server";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { createAdminClient } from "@/lib/supabase/admin";

import { TenantOverviewClient } from "./_client";

interface TenantDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  const { id } = await params;
  const iaDoMolde = await lerIaDoMolde(id);
  return (
    <div className="space-y-6">
      <TenantOverviewClient id={id} />
      {iaDoMolde && <CartaoDaIaDoMolde ia={iaDoMolde} />}
    </div>
  );
}

/**
 * A empresa nasceu com a IA do molde da instalação (migration 0530)? A fonte é
 * a linha `ai.molde_de_ia_aplicado` que o gatilho gravou na auditoria DELA.
 * `null` = não nasceu (ou a leitura falhou): sem cartão, a página fica como era
 * — o cartão é informação, e não vale um 500.
 */
async function lerIaDoMolde(orgId: string): Promise<IaDoMolde | null> {
  if (!z.string().uuid().safeParse(orgId).success) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_audit_log")
    .select("created_at, metadata")
    .eq("organization_id", orgId)
    .eq("action", "ai.molde_de_ia_aplicado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const meta = (data.metadata ?? {}) as {
    molde_org_id?: unknown;
    funcoes_copiadas?: unknown;
    padrao?: { default_model?: unknown } | null;
  };
  let nomeDoMolde: string | null = null;
  if (typeof meta.molde_org_id === "string") {
    const { data: moldeOrg } = await admin
      .from("organizations")
      .select("display_name")
      .eq("id", meta.molde_org_id)
      .maybeSingle();
    nomeDoMolde =
      (moldeOrg as { display_name?: string | null } | null)?.display_name?.trim() || null;
  }
  const usuario = await loadAuthUser();
  return {
    nomeDoMolde,
    funcoes: typeof meta.funcoes_copiadas === "number" ? meta.funcoes_copiadas : 0,
    padrao: typeof meta.padrao?.default_model === "string" ? meta.padrao.default_model : null,
    // Formatado AQUI, com fuso fixo: no cliente, o HTML servido e a hidratação
    // divergiriam. Mesmo motivo e mesma escolha de `/admin/sistema`.
    quando: new Date(data.created_at as string).toLocaleString(
      tagDeIdioma(usuario?.idioma ?? normalizarIdioma(null)),
      {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      },
    ),
  };
}
