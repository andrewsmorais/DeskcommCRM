/**
 * Leitura (SOMENTE leitura) da conta Asaas do dono, para `/admin/asaas`.
 *
 * Só `GET`. Nenhuma função aqui cria, altera ou cancela cobrança — cancelar uma
 * assinatura continua sendo `lib/asaas.ts#deleteSubscription`, chamado pelo fluxo
 * do cliente. Esta tela existe para o dono VER: saldo, cobranças, assinaturas,
 * cancelamentos e o estado dos webhooks.
 *
 * Regras:
 *  - A chave (`ASAAS_API_KEY`) fica no servidor e NUNCA é devolvida nem logada.
 *  - A base só pode ser produção ou sandbox (mesma lista fechada de `lib/asaas.ts`),
 *    para a chave nunca ir parar num host qualquer.
 *  - Nada lança: cada leitura devolve `{ ok:false, motivo }` e a tela mostra o
 *    motivo, em vez de cair inteira porque UMA consulta falhou.
 *  - O token de autenticação de um webhook NÃO sai daqui; da URL fica só origem e
 *    caminho (a query pode carregar segredo).
 *
 * Os formatos de resposta seguem a documentação pública do Asaas (v3). Como não há
 * chave de teste nesta sessão, os campos são lidos de forma defensiva: o que não
 * vier, vira `null` e a tela mostra "—".
 */
import { env } from "@/lib/env";

const BASES_PERMITIDAS = ["https://api.asaas.com", "https://api-sandbox.asaas.com"] as const;

export type LeituraAsaas<T> = { ok: true; dados: T } | { ok: false; motivo: string };

export function ambienteDoAsaas(): { configurado: boolean; base: string | null; sandbox: boolean } {
  if (!env.ASAAS_API_KEY) return { configurado: false, base: null, sandbox: false };
  const base =
    env.ASAAS_BASE_URL ||
    (env.NODE_ENV === "production" ? "https://api.asaas.com" : "https://api-sandbox.asaas.com");
  if (!(BASES_PERMITIDAS as readonly string[]).includes(base)) {
    return { configurado: false, base: null, sandbox: false };
  }
  return { configurado: true, base, sandbox: base.includes("sandbox") };
}

async function get<T>(caminho: string, query: Record<string, string | number> = {}): Promise<LeituraAsaas<T>> {
  const amb = ambienteDoAsaas();
  if (!amb.configurado || !amb.base) return { ok: false, motivo: "sem_chave_do_asaas" };
  const url = new URL(`${amb.base}${caminho}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { access_token: env.ASAAS_API_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, motivo: `asaas_http_${res.status}` };
    return { ok: true, dados: (await res.json()) as T };
  } catch {
    return { ok: false, motivo: "asaas_indisponivel" };
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Saldo da conta, em REAIS (o Asaas fala em reais, não em centavos). */
export async function lerSaldo(): Promise<LeituraAsaas<{ saldo: number | null }>> {
  const r = await get<{ balance?: unknown }>("/v3/finance/balance");
  if (!r.ok) return r;
  return { ok: true, dados: { saldo: num(r.dados.balance) } };
}

export interface WebhookDoAsaas {
  nome: string | null;
  destino: string | null;
  ativo: boolean | null;
  /** true = o Asaas PAUSOU a fila (falhas seguidas na entrega). Pede ação. */
  interrompido: boolean | null;
  eventos: number | null;
  versaoDaApi: string | null;
}

/** Remove query e credenciais da URL: o que sobra é o bastante para reconhecer o destino. */
function destinoSeguro(bruto: unknown): string | null {
  const s = txt(bruto);
  if (!s) return null;
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

export async function lerWebhooks(): Promise<LeituraAsaas<WebhookDoAsaas[]>> {
  const r = await get<{ data?: unknown }>("/v3/webhooks", { limit: 100 });
  if (!r.ok) return r;
  const lista = Array.isArray(r.dados.data) ? (r.dados.data as Record<string, unknown>[]) : [];
  return {
    ok: true,
    dados: lista.map((w) => ({
      nome: txt(w.name),
      destino: destinoSeguro(w.url),
      ativo: typeof w.enabled === "boolean" ? w.enabled : null,
      interrompido: typeof w.interrupted === "boolean" ? w.interrupted : null,
      eventos: Array.isArray(w.events) ? w.events.length : null,
      versaoDaApi: txt(w.apiVersion) ?? (num(w.apiVersion) !== null ? String(w.apiVersion) : null),
    })),
  };
}

export interface CobrancaDoAsaas {
  id: string;
  cliente: string | null;
  valor: number | null;
  status: string | null;
  vencimento: string | null;
  forma: string | null;
}

export async function lerCobrancas(status: string, limite = 20): Promise<LeituraAsaas<{ total: number | null; itens: CobrancaDoAsaas[] }>> {
  const r = await get<{ totalCount?: unknown; data?: unknown }>("/v3/payments", { status, limit: limite });
  if (!r.ok) return r;
  const lista = Array.isArray(r.dados.data) ? (r.dados.data as Record<string, unknown>[]) : [];
  return {
    ok: true,
    dados: {
      total: num(r.dados.totalCount),
      itens: lista.map((p) => ({
        id: txt(p.id) ?? "—",
        cliente: txt(p.customer),
        valor: num(p.value),
        status: txt(p.status),
        vencimento: txt(p.dueDate),
        forma: txt(p.billingType),
      })),
    },
  };
}

export interface AssinaturaDoAsaas {
  id: string;
  valor: number | null;
  ciclo: string | null;
  status: string | null;
  proximoVencimento: string | null;
  forma: string | null;
}

export async function lerAssinaturas(status: "ACTIVE" | "INACTIVE" | "EXPIRED", limite = 20): Promise<LeituraAsaas<{ total: number | null; itens: AssinaturaDoAsaas[] }>> {
  const r = await get<{ totalCount?: unknown; data?: unknown }>("/v3/subscriptions", { status, limit: limite });
  if (!r.ok) return r;
  const lista = Array.isArray(r.dados.data) ? (r.dados.data as Record<string, unknown>[]) : [];
  return {
    ok: true,
    dados: {
      total: num(r.dados.totalCount),
      itens: lista.map((s) => ({
        id: txt(s.id) ?? "—",
        valor: num(s.value),
        ciclo: txt(s.cycle),
        status: txt(s.status),
        proximoVencimento: txt(s.nextDueDate),
        forma: txt(s.billingType),
      })),
    },
  };
}

export const MOTIVO_LEGIVEL: Record<string, string> = {
  sem_chave_do_asaas: "A chave do Asaas não está configurada neste servidor (ASAAS_API_KEY).",
  asaas_indisponivel: "Não consegui falar com o Asaas agora.",
  asaas_http_401: "O Asaas recusou a chave. Confira se ela é do ambiente certo (produção ou sandbox).",
  asaas_http_403: "O Asaas recusou o acesso a este dado com a chave atual.",
  asaas_http_429: "O Asaas pediu para esperar um pouco. Tente de novo em instantes.",
};
