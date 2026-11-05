/**
 * Segredos do passo "WebHook" no desenho do chatbot.
 *
 * `chatbot_flows.grafo` é lido por qualquer membro da organização (a lista de
 * fluxos e o editor). Então o texto puro do segredo de assinatura e do
 * cabeçalho de autorização NUNCA é gravado: o editor manda `segredo` /
 * `autorizacao` em texto, e esta função troca por `segredo_enc` /
 * `autorizacao_enc` (pgp_sym, a mesma cifra dos webhooks das automações)
 * antes do UPDATE. String vazia em `*_enc` = a pessoa removeu.
 *
 * O cifrado que VOLTA do editor só é aceito se for exatamente o que já está
 * gravado neste fluxo para o MESMO passo (mesmo id de nó). O executor decifra
 * o que estiver gravado com a service role e a chave única da instalação
 * (`fn_decrypt_oauth`), e põe o resultado no cabeçalho de um pedido para a URL
 * que quem salvou escolheu. Aceitar qualquer `*_enc` vindo do cliente fazia do
 * executor um decifrador: um gerente colava ali o token cifrado de um canal ou
 * o OAuth do Google Agenda de outro membro (que a RLS deixa ler, mas que só a
 * service role decifra) e recebia o texto aberto no próprio servidor. Cifrado
 * desconhecido é descartado; segredo novo só entra digitado, e aí é cifrado
 * aqui.
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

/** Os `*_enc` de cada passo WebHook do desenho que está gravado, por id de nó. */
function cifradosGravados(anterior: unknown): Map<string, Partial<Record<string, string>>> {
  const porNo = new Map<string, Partial<Record<string, string>>>();
  const nos = (anterior as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(nos)) return porNo;
  for (const no of nos as Array<{ id?: unknown; type?: unknown; data?: unknown }>) {
    if (no?.type !== "webhook" || typeof no.id !== "string") continue;
    const data = (no.data ?? {}) as Record<string, unknown>;
    const gravados: Partial<Record<string, string>> = {};
    for (const [, cifrado] of CAMPOS) {
      const valor = data[cifrado];
      if (typeof valor === "string" && valor) gravados[cifrado] = valor;
    }
    porNo.set(no.id, gravados);
  }
  return porNo;
}

/**
 * `anterior` é o `grafo` que está gravado AGORA neste fluxo (lido pelo
 * servidor, nunca do corpo do pedido); null para fluxo sem desenho.
 */
export async function cifrarSegredosDoGrafo(
  admin: SupabaseClient,
  grafo: Grafo,
  anterior: unknown,
): Promise<Grafo | null> {
  const gravados = cifradosGravados(anterior);
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
      } else if (typeof data[cifrado] === "string" && data[cifrado] !== "") {
        // Só o que este passo já tinha. Qualquer outro cifrado (de outro
        // passo, de outro fluxo, de outra coluna) cai.
        if (gravados.get(no.id)?.[cifrado] !== data[cifrado]) data[cifrado] = null;
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
