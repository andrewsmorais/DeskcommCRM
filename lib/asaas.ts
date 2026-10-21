import { env } from "@/lib/env";

export async function deleteSubscription(id: string) {
  if (!/^sub_[a-zA-Z0-9_]+$/.test(id) || !env.ASAAS_API_KEY) throw new Error("asaas_unavailable");
  const base =
    env.ASAAS_BASE_URL ||
    (env.NODE_ENV === "production" ? "https://api.asaas.com" : "https://api-sandbox.asaas.com");
  if (!["https://api.asaas.com", "https://api-sandbox.asaas.com"].includes(base))
    throw new Error("asaas_unavailable");
  const res = await fetch(`${base}/v3/subscriptions/${id}`, {
    method: "DELETE",
    headers: { access_token: env.ASAAS_API_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  // Um id do outro ambiente também retorna 404. Não tratar isso como prova
  // de cancelamento nem mudar a assinatura compartilhada com o CRM atual.
  if (!res.ok) throw new Error("asaas_cancel_failed");
  return { ok: true, deleted: true };
}
