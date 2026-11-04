/**
 * Cifra/decifra de secrets de webhooks (at-rest) — retrofit da spec §10.
 *
 * Reusa a infra do Nuvemshop/WAHA: RPCs `fn_encrypt_oauth`/`fn_decrypt_oauth`
 * (pgp_sym AES-256 com a chave na GUC `app.nuvemshop_oauth_key`). As RPCs têm
 * GRANT apenas para service_role — sempre chame com o admin client.
 *
 * Contrato de erro: encrypt SEM chave configurada retorna null (o caller
 * decide — rotas de escrita respondem 422 com instrução); decrypt que falha
 * retorna null (o caller aplica o precedente WAHA: hmacSkipped, nunca 500).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/** Cifra um secret. Retorna o bytea (formato hex "\x…" do PostgREST) ou null se a chave estiver ausente/erro. */
export async function encryptWebhookSecret(
  admin: SupabaseClient,
  plaintext: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("fn_encrypt_oauth", { plaintext });
  if (error || !data) {
    logger.warn("[webhooks.secrets] encrypt falhou (GUC app.nuvemshop_oauth_key ausente?)", {
      error: error?.message ?? "empty",
    });
    return null;
  }
  return data as string;
}

/** Decifra um secret cifrado (bytea hex ou hex puro de jsonb). null em falha. */
export async function decryptWebhookSecret(
  admin: SupabaseClient,
  ciphertext: string,
): Promise<string | null> {
  const normalized = ciphertext.startsWith("\\x") ? ciphertext : `\\x${ciphertext}`;
  const { data, error } = await admin.rpc("fn_decrypt_oauth", { ciphertext: normalized });
  if (error || !data) return null;
  return data as string;
}

export interface RuleActionInput {
  type: string;
  config?: Record<string, unknown>;
}

/** Os `secret_enc` das ações call_webhook que a regra tem gravadas agora. */
function storedRuleSecrets(storedActions: unknown): Set<string> {
  const stored = new Set<string>();
  if (!Array.isArray(storedActions)) return stored;
  for (const action of storedActions as Array<{
    type?: unknown;
    config?: { secret_enc?: unknown };
  }>) {
    const enc = action?.config?.secret_enc;
    if (action?.type === "call_webhook" && typeof enc === "string" && enc) stored.add(enc);
  }
  return stored;
}

/**
 * Troca `config.secret` (plaintext, input do editor) por `config.secret_enc`
 * (hex cifrado) em ações call_webhook antes de gravar no jsonb da regra.
 * Retorna null se a cifra estiver indisponível (caller responde 422).
 *
 * `secret_enc` que volta do editor (round-trip sem re-digitar) só fica se for
 * um que ESTA regra já tinha gravado — `storedActions` é o `actions` lido pelo
 * servidor, nunca do corpo; `[]` numa regra nova. O executor decifra o
 * `secret_enc` com a service role e a chave única da instalação e o usa como
 * chave do HMAC de um pedido para a URL que quem salvou escolheu: aceitar
 * qualquer cifrado do cliente deixava um gerente colar ali o token cifrado de
 * um canal (que a RLS deixa ler, mas só a service role decifra) e receber, na
 * assinatura, a prova do texto aberto. Cifrado desconhecido é descartado.
 */
export async function encryptRuleActionSecrets(
  admin: SupabaseClient,
  actions: RuleActionInput[],
  storedActions: unknown,
): Promise<RuleActionInput[] | null> {
  const stored = storedRuleSecrets(storedActions);
  const out: RuleActionInput[] = [];
  for (const action of actions) {
    if (
      action.type === "call_webhook" &&
      typeof action.config?.secret === "string" &&
      action.config.secret
    ) {
      const enc = await encryptWebhookSecret(admin, action.config.secret);
      if (enc === null) return null;
      const { secret: _plain, ...restConfig } = action.config;
      out.push({ ...action, config: { ...restConfig, secret_enc: enc.replace(/^\\x/, "") } });
    } else {
      const { secret: _drop, ...restConfig } = action.config ?? {};
      const enc = restConfig.secret_enc;
      if (
        action.type === "call_webhook" &&
        enc !== undefined &&
        !(typeof enc === "string" && stored.has(enc))
      ) {
        delete restConfig.secret_enc;
      }
      out.push({ ...action, config: restConfig });
    }
  }
  return out;
}
