/**
 * O que o assistente sabe sobre QUEM pergunta: plano, limites, papel e as
 * telas que o menu desta pessoa mostra. Tudo lido no servidor, das mesmas
 * fontes que desenham o menu e liberam os recursos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContextoDoCliente } from "@/lib/ajuda/prompt";
import type { Role } from "@/lib/auth/types";
import { getOrganizationBilling } from "@/lib/billing";
import { LIMITES_DO_PLANO, planoComercial, type LimiteDoPlano } from "@/lib/billing/catalogo";
import { emailDeSuporte, whatsappDeSuporte } from "@/lib/branding/saida";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { searchable } from "@/lib/navigation/registry";
import { capacidadesLigadas } from "@/lib/organizacao/capacidades";

export async function contatosDeSuporte(): Promise<{ email: string; whatsapp: string }> {
  const [email, whatsapp] = await Promise.all([emailDeSuporte(), whatsappDeSuporte()]);
  return { email, whatsapp };
}

export async function contextoDoCliente(
  admin: SupabaseClient,
  a: { organizationId: string; role: Role | null; isPlatformAdmin: boolean; marca: string },
): Promise<ContextoDoCliente> {
  const [leitura, modulos, org, contato] = await Promise.all([
    getOrganizationBilling(a.organizationId),
    modulosLigados(admin),
    admin.from("organizations").select("settings").eq("id", a.organizationId).maybeSingle(),
    contatosDeSuporte(),
  ]);
  const billing = leitura.ok ? leitura.billing : null;
  const plano = billing ? planoComercial(billing.plan_slug) : null;
  let limites: Record<LimiteDoPlano, number> | null = null;
  if (billing) {
    const l = {} as Record<LimiteDoPlano, number>;
    let completo = true;
    for (const k of LIMITES_DO_PLANO) {
      const v = billing.limits[k];
      if (typeof v === "number") l[k] = v;
      else completo = false;
    }
    if (completo) limites = l;
  }
  const telas = searchable(
    a.isPlatformAdmin,
    a.role,
    undefined,
    modulos,
    capacidadesLigadas(org.data?.settings, modulos),
  ).map((d) => ({ href: d.href, label: d.label }));

  return {
    marca: a.marca,
    plano,
    status: billing?.status ?? null,
    limites,
    papel: a.role,
    telasVisiveis: telas,
    contato,
  };
}
