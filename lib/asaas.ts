import { env } from "@/lib/env";

const BASES_PERMITIDAS = ["https://api.asaas.com", "https://api-sandbox.asaas.com"];

/** A base do Asaas, só produção ou sandbox — a chave nunca vai para outro host. */
function baseDoAsaas(): string {
  if (!env.ASAAS_API_KEY) throw new Error("asaas_unavailable");
  const base =
    env.ASAAS_BASE_URL ||
    (env.NODE_ENV === "production" ? "https://api.asaas.com" : "https://api-sandbox.asaas.com");
  if (!BASES_PERMITIDAS.includes(base)) throw new Error("asaas_unavailable");
  return base;
}

async function chamar(
  metodo: "GET" | "POST" | "PUT" | "DELETE",
  caminho: string,
  corpo?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> | null }> {
  const res = await fetch(`${baseDoAsaas()}${caminho}`, {
    method: metodo,
    headers: { access_token: env.ASAAS_API_KEY, "Content-Type": "application/json" },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  let dados: Record<string, unknown> | null = null;
  try {
    const lido = (await res.json()) as unknown;
    dados = lido && typeof lido === "object" ? (lido as Record<string, unknown>) : null;
  } catch {
    dados = null;
  }
  return { ok: res.ok, status: res.status, dados };
}

const ID_DE_ASSINATURA = /^sub_[a-zA-Z0-9_]+$/;
const ID_DE_COBRANCA = /^pay_[a-zA-Z0-9_]+$/;

export async function deleteSubscription(id: string) {
  if (!ID_DE_ASSINATURA.test(id)) throw new Error("asaas_unavailable");
  const r = await chamar("DELETE", `/v3/subscriptions/${id}`);
  // Um id do outro ambiente também retorna 404. Não tratar isso como prova
  // de cancelamento nem mudar a assinatura compartilhada com o CRM atual.
  if (!r.ok) throw new Error("asaas_cancel_failed");
  return { ok: true, deleted: true };
}

/** O cliente do Asaas dono da recorrência (a cobrança avulsa vai para ele). */
export async function clienteDaAssinatura(id: string): Promise<string> {
  if (!ID_DE_ASSINATURA.test(id)) throw new Error("asaas_unavailable");
  const r = await chamar("GET", `/v3/subscriptions/${id}`);
  const cliente = r.dados?.customer;
  if (!r.ok || typeof cliente !== "string" || !/^cus_[a-zA-Z0-9_]+$/.test(cliente))
    throw new Error("asaas_subscription_unreadable");
  return cliente;
}

/**
 * Muda o valor da recorrência. `updatePendingPayments` leva o valor novo também
 * para a cobrança do próximo período que o Asaas já gerou — é ela que deve sair
 * com o preço do plano novo (troca de plano, 0508).
 */
export async function atualizarValorDaAssinatura(id: string, valorCents: number) {
  if (!ID_DE_ASSINATURA.test(id) || !Number.isInteger(valorCents) || valorCents <= 0)
    throw new Error("asaas_unavailable");
  const r = await chamar("PUT", `/v3/subscriptions/${id}`, {
    value: valorCents / 100,
    updatePendingPayments: true,
  });
  if (!r.ok) throw new Error("asaas_update_failed");
}

/**
 * Cobrança avulsa (PIX, boleto ou cartão, à escolha de quem paga, no link do
 * Asaas). Devolve o id e o link; o link só é aceito se for do domínio do Asaas.
 */
export async function criarCobrancaAvulsa(p: {
  cliente: string;
  valorCents: number;
  vencimento: string;
  descricao: string;
  referencia: string;
}): Promise<{ id: string; link: string }> {
  if (
    !/^cus_[a-zA-Z0-9_]+$/.test(p.cliente) ||
    !Number.isInteger(p.valorCents) ||
    p.valorCents <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)
  )
    throw new Error("asaas_unavailable");
  const r = await chamar("POST", "/v3/payments", {
    customer: p.cliente,
    billingType: "UNDEFINED",
    value: p.valorCents / 100,
    dueDate: p.vencimento,
    description: p.descricao.slice(0, 500),
    externalReference: p.referencia,
  });
  const id = r.dados?.id;
  const link = linkDoAsaas(r.dados?.invoiceUrl);
  if (!r.ok || typeof id !== "string" || !ID_DE_COBRANCA.test(id) || !link)
    throw new Error("asaas_payment_failed");
  return { id, link };
}

/** Apaga uma cobrança ainda não paga. Cobrança já recebida o Asaas recusa. */
export async function apagarCobranca(id: string) {
  if (!ID_DE_COBRANCA.test(id)) throw new Error("asaas_unavailable");
  const r = await chamar("DELETE", `/v3/payments/${id}`);
  if (!r.ok) throw new Error("asaas_delete_failed");
}

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
