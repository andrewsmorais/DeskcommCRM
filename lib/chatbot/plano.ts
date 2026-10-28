/**
 * O chatbot dentro do plano — o que os cards da página de vendas prometem.
 *
 *   - Essencial: 1 chatbot ligado, com os passos básicos (mensagem, mídia,
 *     menu, perguntar, horário, transferir, etiqueta, agendar, mover no funil,
 *     avaliação, finalizar).
 *   - Impulso: 2 chatbots ligados e o "Chatbot avançado": webhook, condições
 *     da conversa, aguardar, distribuir por peso, bloquear e excluir contato,
 *     acionar outro fluxo, iniciar follow-up e o início por automação (é por
 *     ele que entram Kiwify e Cakto).
 *   - Escala: 3 chatbots ou mais (a proposta).
 *
 * "Chatbot ligado" é todo fluxo com `is_active = true`, comece ele por um
 * número, por automação ou à mão — é o que o cliente vê como "ligado" na tela.
 * Quem já tem mais ligados que o plano novo permite (fez downgrade) não perde
 * nada: só não liga outro. Passo avançado é barrado ao GRAVAR o desenho;
 * fluxo gravado antes do downgrade continua rodando.
 *
 * E a regra do "um chatbot por número" (Fase 4): dois fluxos ligados que
 * respondem mensagens só conflitam quando atendem o MESMO número. Antes, ligar
 * um desligava todos os outros da organização, e um cliente com 2 números não
 * conseguia ter um chatbot em cada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { canUse, getOrganizationBilling } from "@/lib/billing";
import { verificarRecursoDoPlano, type AcessoAoRecurso } from "@/lib/billing/acesso";
import { assinaturaExigida } from "@/lib/billing/exigencia";
import { lerConfig, type Grafo } from "./passos";
import { PASSOS_AVANCADOS } from "./passos-avancados";

export { PASSOS_AVANCADOS };

export function usaPassoAvancado(grafo: Grafo): boolean {
  return grafo.nodes.some((n) => PASSOS_AVANCADOS.has(String(n.type)));
}

/** Desenho com passo avançado só grava se o plano incluir o Chatbot avançado. */
export async function conferirPassosDoPlano(orgId: string, grafo: Grafo): Promise<AcessoAoRecurso> {
  if (!usaPassoAvancado(grafo)) return { ok: true };
  return verificarRecursoDoPlano(orgId, "chatbot_avancado");
}

export type CotaDeChatbots =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 503;
      code: "billing_limit" | "billing_unavailable";
      message: string;
    };

export function mensagemDaCotaDeChatbots(plano: string | null, limite: number): string {
  if (limite <= 0 || !plano) {
    return "Escolha um plano para ligar chatbots. Veja em Configurações › Plano e cobrança.";
  }
  const qtd = limite === 1 ? "1 chatbot ligado" : `${limite} chatbots ligados`;
  return `O plano ${plano} permite ${qtd}. Desligue outro chatbot ou mude de plano em Configurações › Plano e cobrança.`;
}

/**
 * Pode LIGAR mais um chatbot? Conta os ligados da organização, fora o próprio
 * fluxo e fora os que esta mesma operação vai desligar (`desligando`).
 * A organização vem da sessão validada, nunca do corpo da requisição.
 */
export async function conferirCotaDeChatbots(
  db: SupabaseClient,
  orgId: string,
  opts: {
    fluxoId: string;
    desligando?: readonly string[];
    isento?: boolean;
    ambiente?: Record<string, string | undefined>;
  },
): Promise<CotaDeChatbots> {
  if (opts.isento || !assinaturaExigida(opts.ambiente)) return { ok: true };
  const { data, error } = await db
    .from("chatbot_flows")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (error || !data) {
    return {
      ok: false,
      status: 503,
      code: "billing_unavailable",
      message: "Não foi possível conferir quantos chatbots o seu plano permite. Tente novamente.",
    };
  }
  const fora = new Set([opts.fluxoId, ...(opts.desligando ?? [])]);
  const ligados = data.filter((f) => !fora.has(String(f.id))).length;

  const leitura = await getOrganizationBilling(orgId);
  if (!leitura.ok) {
    return {
      ok: false,
      status: 503,
      code: "billing_unavailable",
      message: "Não foi possível confirmar o seu plano. Tente novamente em instantes.",
    };
  }
  const check = canUse(leitura.billing, "chatbots", ligados);
  if (check.ok) return { ok: true };
  return {
    ok: false,
    status: 403,
    code: "billing_limit",
    message: mensagemDaCotaDeChatbots(leitura.billing?.plan_name ?? null, check.limite),
  };
}

/**
 * Os números que um fluxo atende pelos seus passos "Iniciar por um canal".
 * `"todos"` quando algum início não escolhe número (vale para qualquer um);
 * conjunto vazio quando o fluxo não responde mensagens.
 */
export function numerosDoFluxo(grafo: Grafo): "todos" | Set<string> {
  const numeros = new Set<string>();
  for (const no of grafo.nodes) {
    if (no.type !== "inicio_canal") continue;
    const c = lerConfig("inicio_canal", no.data);
    if (!c.channel_session_id) return "todos";
    numeros.add(c.channel_session_id);
  }
  return numeros;
}

/** Dois fluxos disputam as mesmas mensagens? (atendem algum número em comum) */
export function disputamNumero(a: Grafo, b: Grafo): boolean {
  const na = numerosDoFluxo(a);
  const nb = numerosDoFluxo(b);
  if (na !== "todos" && na.size === 0) return false;
  if (nb !== "todos" && nb.size === 0) return false;
  if (na === "todos" || nb === "todos") return true;
  for (const n of na) if (nb.has(n)) return true;
  return false;
}
