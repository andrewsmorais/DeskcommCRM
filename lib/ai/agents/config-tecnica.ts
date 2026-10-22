/**
 * Configuração técnica do agente: quem pode ver e mudar.
 *
 * No ChatAI Online a chave de IA é da PLATAFORMA (o custo é do dono) e o
 * cliente final não sabe o que é provedor, modelo ou chave de API. Por isso
 * estes campos só existem para o super-admin da plataforma. Para qualquer
 * outra pessoa, a tela esconde os cards e o SERVIDOR trava os valores — sem a
 * trava no servidor, esconder a tela não protegeria nada: o mesmo payload
 * chega por uma chamada direta.
 *
 * Os cinco caminhos que gravam versão de agente passam por `travarConfigTecnica`:
 * `app/app/ai/agents/[id]/_actions.ts` (rascunho e criação),
 * `app/api/v1/ai/agents/route.ts` (criação), `.../versions/route.ts` (nova
 * versão) e `.../versions/[vid]/route.ts` (edição de rascunho).
 */
import { IDS_DE_PROVEDOR } from "@/lib/ai/pontos/provedores";

export const CAMPOS_TECNICOS = [
  "provider",
  "model",
  "credential_id",
  "operator_model",
  "max_steps",
  "token_budget",
  "cost_budget_cents",
  "history_message_window",
  "history_token_window",
] as const;

export type CampoTecnico = (typeof CAMPOS_TECNICOS)[number];

export type ConfigTecnica = {
  provider: (typeof IDS_DE_PROVEDOR)[number];
  model: string;
  credential_id: string | null;
  operator_model: string | null;
  max_steps: number;
  token_budget: number;
  cost_budget_cents: number;
  history_message_window: number;
  history_token_window: number;
};

const PROVEDOR_PADRAO = "openai";
const MODELO_PADRAO = "gpt-5.4-nano";

/**
 * O que todo agente de cliente usa. Provedor e modelo vêm do ambiente
 * (`PLATAFORMA_IA_PROVEDOR`, `PLATAFORMA_IA_MODELO`), para o dono trocar o
 * modelo de todos sem abrir agente por agente. A chave é sempre a da
 * instalação (`credential_id: null`). Provedor desconhecido no ambiente cai
 * no padrão em vez de lançar: isto roda dentro de request handler.
 */
export function configTecnicaDaPlataforma(
  ambiente: Record<string, string | undefined> = process.env,
): ConfigTecnica {
  const pedido = (ambiente.PLATAFORMA_IA_PROVEDOR ?? "").trim();
  const provider = (IDS_DE_PROVEDOR as readonly string[]).includes(pedido)
    ? (pedido as ConfigTecnica["provider"])
    : PROVEDOR_PADRAO;
  const model = (ambiente.PLATAFORMA_IA_MODELO ?? "").trim() || MODELO_PADRAO;
  return {
    provider,
    model,
    credential_id: null,
    operator_model: null,
    max_steps: 10,
    token_budget: 50_000,
    cost_budget_cents: 50,
    history_message_window: 20,
    history_token_window: 8_000,
  };
}

/** Só o super-admin da plataforma, fora de sessão de suporte. */
export function podeEditarConfigTecnica(user: {
  is_platform_admin?: boolean | null;
  support?: unknown;
}): boolean {
  return user.is_platform_admin === true && !user.support;
}

/**
 * Aplica a trava a um payload de versão.
 *
 * - `pode`: devolve o payload como veio.
 * - `patch`: tira os campos técnicos — o rascunho mantém o que já tinha.
 * - `insert`: os campos técnicos vêm da versão-base do agente (o que o dono
 *   configurou continua valendo) ou, sem base, do padrão da plataforma.
 */
export function travarConfigTecnica<T extends Record<string, unknown>>(
  payload: T,
  opts: {
    pode: boolean;
    modo: "insert" | "patch";
    base?: Partial<Record<CampoTecnico, unknown>> | null;
    ambiente?: Record<string, string | undefined>;
  },
): T {
  if (opts.pode) return payload;
  const saida: Record<string, unknown> = { ...payload };
  if (opts.modo === "patch") {
    for (const campo of CAMPOS_TECNICOS) delete saida[campo];
    return saida as T;
  }
  const padrao = configTecnicaDaPlataforma(opts.ambiente);
  const base = opts.base && typeof opts.base.provider === "string" ? opts.base : null;
  for (const campo of CAMPOS_TECNICOS) {
    saida[campo] = base && campo in base ? base[campo] : padrao[campo];
  }
  return saida as T;
}
