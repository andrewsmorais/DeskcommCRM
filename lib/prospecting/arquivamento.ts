import type { CampaignConfig } from "./schema";

/**
 * ARQUIVAR UMA CAMPANHA (vindo do produto original, #4359) — o marcador e a régua da lista.
 *
 * O pedido da comunidade: campanha que falhou ou veio zerada fica para sempre em
 * "Suas campanhas". A saída é ARQUIVAR, e arquivar NÃO é excluir — os negócios, as
 * conversas, os candidatos e o custo daquela campanha continuam exatamente onde
 * estão. Por isso o gesto não é um `delete`: é uma chave no jsonb `config`, que a
 * lista lê para esconder o cartão e o filtro "Ver arquivadas" lê para mostrá-lo.
 *
 * Mora em módulo próprio (e não em `_client.tsx`) porque a régua da lista é
 * testável sem DOM, e porque o servidor também precisa dela: a rota ordena as não
 * arquivadas primeiro para as arquivadas não roubarem as 50 vagas da lista.
 */
export const CHAVE_ARQUIVADA = "arquivada_em";

/** Quando esta campanha foi arquivada, ou `null` se ela está na lista. */
export function arquivadaEm(config: unknown): string | null {
  if (config === null || typeof config !== "object") return null;
  const valor = (config as Record<string, unknown>)[CHAVE_ARQUIVADA];
  return typeof valor === "string" && valor !== "" ? valor : null;
}

/** A campanha está arquivada? (config nula — busca que nunca iniciou — não está.) */
export function estaArquivada(campanha: { config: unknown }): boolean {
  return arquivadaEm(campanha.config) !== null;
}

/**
 * O que a lista mostra: as campanhas na lista principal, ou as arquivadas quando o
 * filtro está ligado. Uma campanha nunca aparece nos dois lugares — e nunca some
 * dos dois: é o que impede o arquivamento de virar perda de dado.
 */
export function campanhasVisiveis<T extends { config: unknown }>(
  campanhas: readonly T[],
  verArquivadas: boolean,
): T[] {
  return campanhas.filter((c) => estaArquivada(c) === verArquivadas);
}

/**
 * A configuração sem o marcador. O marcador é do servidor, nunca da pessoa: uma aba
 * aberta antes do desarquivar ainda manda `arquivada_em` no Iniciar, e gravá-lo junto
 * com `status='running'` faria a campanha enviar escondida.
 */
export function semMarcadorDeArquivamento(config: CampaignConfig): CampaignConfig {
  return { ...config, [CHAVE_ARQUIVADA]: undefined };
}

/**
 * ARQUIVAR UMA CAMPANHA (vindo do produto original, #4359) — some da lista, NADA
 * é apagado. Os negócios, as conversas, os candidatos e o custo daquela campanha
 * ficam onde estão. O único `update` é na própria campanha:
 *
 *   - `config.arquivada_em` — o marcador que a lista lê (sem coluna nova);
 *   - `status` — campanha `running` vira `paused` no MESMO `update` que a esconde.
 *     Campanha invisível continuando a disparar mensagem seria o pior desfecho.
 *
 * Idempotente pela guarda do `where`: clicar duas vezes não reescreve o marcador.
 */
export const ARQUIVAR_CAMPANHA_SQL =
  "update prospecting_campaigns set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('arquivada_em', $3::text), status = case when status='running' then 'paused' else status end, updated_at=now() where organization_id=$1 and id=$2 and coalesce(config->>'arquivada_em','') = '' returning id,status";

/**
 * DESARQUIVAR: tira o marcador e a campanha volta para a lista — PAUSADA, como
 * estava. Retomar é outro clique, de propósito. O `nullif` devolve `null` ao
 * rascunho que não tinha configuração (senão a tela tomaria `{}` por configurada).
 */
export const DESARQUIVAR_CAMPANHA_SQL =
  "update prospecting_campaigns set config = nullif(coalesce(config, '{}'::jsonb) - 'arquivada_em', '{}'::jsonb), updated_at=now() where organization_id=$1 and id=$2 and coalesce(config->>'arquivada_em','') <> '' returning id,status";
