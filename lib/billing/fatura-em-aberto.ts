/**
 * A cobrança que falta pagar — para quem teve o teste vencido ou atrasou.
 *
 * O caminho de volta para quem está bloqueado (lib/billing/exigencia.ts) não é
 * uma assinatura nova: a assinatura do Asaas continua lá, com a cobrança
 * VENCIDA (ou pendente) esperando pagamento. Pagando pelo link do Asaas
 * (`invoiceUrl`), o webhook da página de vendas marca a assinatura como ativa
 * e o CRM abre sozinho.
 *
 * Só leitura (`GET` no Asaas, pelo mesmo cliente do painel do dono). Nada
 * lança: sem chave, sem assinatura ou Asaas fora do ar, devolve `null` e a tela
 * mostra só "Escolher plano". O link só é aceito se for do domínio do Asaas.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { get } from "@/lib/admin/asaas-leitura";

export type FaturaEmAberto = {
  url: string;
  valor: number | null;
  vencimento: string | null;
  vencida: boolean;
};

type Cobranca = { invoiceUrl?: unknown; value?: unknown; dueDate?: unknown; status?: unknown };

export function linkDoAsaas(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    return u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A mais antiga primeiro: é a que trancou o acesso. */
export function escolherFatura(cobrancas: Cobranca[]): FaturaEmAberto | null {
  const validas = cobrancas
    .map((c) => ({
      url: linkDoAsaas(c.invoiceUrl),
      valor: typeof c.value === "number" ? c.value : null,
      vencimento: typeof c.dueDate === "string" ? c.dueDate : null,
      vencida: c.status === "OVERDUE",
    }))
    .filter((c): c is FaturaEmAberto => c.url !== null);
  validas.sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999"));
  return validas[0] ?? null;
}

export async function faturaEmAberto(orgId: string): Promise<FaturaEmAberto | null> {
  try {
    const { data: assinatura } = await createAdminClient()
      .from("subscriptions")
      .select("asaas_subscription_id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const id = assinatura?.asaas_subscription_id;
    if (typeof id !== "string" || !/^sub_[A-Za-z0-9_]+$/.test(id)) return null;

    for (const status of ["OVERDUE", "PENDING"] as const) {
      const r = await get<{ data?: Cobranca[] }>("/v3/payments", {
        subscription: id,
        status,
        limit: 10,
      });
      if (!r.ok) return null;
      const fatura = escolherFatura(r.dados.data ?? []);
      if (fatura) return fatura;
    }
    return null;
  } catch {
    return null;
  }
}
