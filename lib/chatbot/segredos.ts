/**
 * Segredos do passo "WebHook" no desenho do chatbot.
 *
 * `chatbot_flows.grafo` é lido por qualquer membro da organização (a lista de
 * fluxos e o editor). Então o texto puro do segredo de assinatura e do
 * cabeçalho de autorização NUNCA é gravado: o editor manda `segredo` /
 * `autorizacao` em texto, e esta função troca por `segredo_enc` /
 * `autorizacao_enc` (pgp_sym, a mesma cifra dos webhooks das automações)
 * antes do UPDATE. O que já estava cifrado passa direto. String vazia em
 * `*_enc` = a pessoa removeu.
 *
 * Devolve null quando a cifra não está disponível na instalação — a rota
 * responde 422 em vez de gravar o segredo aberto.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";
import type { Grafo } from "./passos";

const CAMPOS = [
  ["segredo", "segredo_enc"],
  ["autorizacao", "autorizacao_enc"],
] as const;

export async function cifrarSegredosDoGrafo(admin: SupabaseClient, grafo: Grafo): Promise<Grafo | null> {
  const nodes: Grafo["nodes"] = [];
  for (const no of grafo.nodes) {
    if (no.type !== "webhook") {
      nodes.push(no);
      continue;
    }
    const data: Record<string, unknown> = { ...no.data };
    for (const [aberto, cifrado] of CAMPOS) {
      const texto = data[aberto];
      delete data[aberto];
      if (typeof texto === "string" && texto.trim()) {
        const enc = await encryptWebhookSecret(admin, texto.trim());
        if (enc === null) return null;
        data[cifrado] = enc;
      } else if (data[cifrado] === "") {
        data[cifrado] = null;
      }
    }
    nodes.push({ ...no, data });
  }
  return { ...grafo, nodes };
}

export async function decifrarSegredosDoPasso(
  admin: SupabaseClient,
  c: { segredo_enc: string | null; autorizacao_enc: string | null },
): Promise<{ segredo: string | null; autorizacao: string | null }> {
  return {
    segredo: c.segredo_enc ? await decryptWebhookSecret(admin, c.segredo_enc) : null,
    autorizacao: c.autorizacao_enc ? await decryptWebhookSecret(admin, c.autorizacao_enc) : null,
  };
}
