"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { parseReaisToCents } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lança ou remove um custo da PLATAFORMA (`platform_custos_fixos`), que entra no
 * lucro estimado de `/admin/metricas`.
 *
 * ── O gate é `requirePlatformAdmin()` DENTRO da action ──────────────────────
 * Server Action não passa pelo layout de `/admin`: um POST direto entraria sem
 * ele, e a escrita vai pelo `service_role`, que o Postgres não consegue negar.
 *
 * ── Nada vem do corpo sem validação ─────────────────────────────────────────
 * A categoria e o tipo são de lista fechada; o valor passa por `parseReaisToCents`;
 * o percentual é limitado a 0–100%. O que não fecha vira erro silencioso na
 * tela (a página recarrega sem a linha), nunca um 500.
 */

const CATEGORIAS = ["servidor", "ia", "dominio", "email", "gateway", "ferramentas", "outros"] as const;
const TIPOS = ["fixo_mensal", "percentual_receita"] as const;

type Categoria = (typeof CATEGORIAS)[number];
type Tipo = (typeof TIPOS)[number];

function daLista<T extends string>(lista: readonly T[], valor: FormDataEntryValue | null, padrao: T): T {
  return typeof valor === "string" && (lista as readonly string[]).includes(valor) ? (valor as T) : padrao;
}

/** "2,5" ou "2.5" (% sobre o MRR) → pontos-base (250). null se inválido. */
function percentualParaPontosBase(bruto: string): number | null {
  const n = Number(bruto.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

export async function salvarCustoDaPlataforma(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin();

  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80);
  if (!nome) return;
  const categoria: Categoria = daLista(CATEGORIAS, formData.get("categoria"), "outros");
  const tipo: Tipo = daLista(TIPOS, formData.get("tipo"), "fixo_mensal");
  const bruto = String(formData.get("valor") ?? "");

  let valorCents = 0;
  let basisPoints = 0;
  if (tipo === "fixo_mensal") {
    const cents = parseReaisToCents(bruto);
    if (cents === null) return;
    valorCents = cents;
  } else {
    const bp = percentualParaPontosBase(bruto);
    if (bp === null) return;
    basisPoints = bp;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_custos_fixos" as never)
    .insert({ nome, categoria, tipo, valor_cents: valorCents, basis_points: basisPoints } as never);
  if (error) return;

  await audit({
    action: "platform.custo_changed",
    actorUserId: user.id,
    actingAsPlatformAdmin: true,
    resourceType: "platform_custos_fixos",
    resourceId: null,
    metadata: { acao: "criado", nome, categoria, tipo, valor_cents: valorCents, basis_points: basisPoints },
  });
  revalidatePath("/admin/metricas");
}

export async function removerCustoDaPlataforma(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const admin = createAdminClient();
  const { error } = await admin.from("platform_custos_fixos" as never).delete().eq("id", id);
  if (error) return;

  await audit({
    action: "platform.custo_changed",
    actorUserId: user.id,
    actingAsPlatformAdmin: true,
    resourceType: "platform_custos_fixos",
    resourceId: id,
    metadata: { acao: "removido" },
  });
  revalidatePath("/admin/metricas");
}
