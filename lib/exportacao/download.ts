/**
 * O REGISTRO DE QUE A PESSOA JÁ BAIXOU OS DADOS — para os lembretes pararem.
 *
 * Fica em `organizations.settings.exportacao.ultimo_download_em`, fora de
 * `ciclo_de_vida`: aquele estado recomeça a cada encerramento, e o download é
 * um fato com data própria. Quem decide se ele dispensa um lembrete é
 * `lembreteDispensado` (`ciclo-de-vida.ts`), comparando com o fim do acesso.
 *
 * ─── Por que só no FIM do arquivo ───────────────────────────────────────────
 *
 * O ZIP sai em fluxo enquanto é gerado. Marcar no clique faria um download que
 * caiu no meio (internet ruim, aba fechada) contar como feito — e os lembretes
 * parariam justamente para quem ficou sem os dados. `avisarAoTerminar` só chama
 * o registro quando a fonte acabou E o último pedaço foi pedido por quem está
 * lendo: a stream é puxada (`pull`), então o fim só chega depois que os pedaços
 * anteriores saíram. Cancelamento ou erro no meio não registram nada.
 */
import { logger } from "@/lib/logger";
import type { createAdminClient } from "@/lib/supabase/admin";

/** Só o cliente admin grava em `organizations` (a RLS recusa o de sessão em silêncio). */
type ClienteAdmin = ReturnType<typeof createAdminClient>;

/** A data do último download completo, ou `null`. Nunca lança. */
export function ultimoDownload(settings: unknown): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const bloco = (settings as Record<string, unknown>).exportacao;
  if (!bloco || typeof bloco !== "object" || Array.isArray(bloco)) return null;
  const valor = (bloco as Record<string, unknown>).ultimo_download_em;
  return typeof valor === "string" && !Number.isNaN(new Date(valor).getTime()) ? valor : null;
}

/** Grava o download. Best-effort: falhar aqui só faz um lembrete a mais sair. */
export async function registrarDownload(db: ClienteAdmin, orgId: string, quando: Date): Promise<void> {
  // Relê logo antes de gravar: `settings` é compartilhado com o resto do sistema
  // (a tela de Configurações, o estado dos avisos), e sobrescrever o que acabou
  // de mudar seria pior que um lembrete repetido.
  const { data, error: erroDeLeitura } = await db
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (erroDeLeitura || !data) {
    logger.warn("exportacao_download_nao_registrado", { orgId, etapa: "leitura" });
    return;
  }
  const atual =
    data.settings && typeof data.settings === "object" && !Array.isArray(data.settings)
      ? (data.settings as Record<string, unknown>)
      : {};
  const bloco =
    atual.exportacao && typeof atual.exportacao === "object" && !Array.isArray(atual.exportacao)
      ? (atual.exportacao as Record<string, unknown>)
      : {};
  const { error } = await db
    .from("organizations")
    .update({ settings: { ...atual, exportacao: { ...bloco, ultimo_download_em: quando.toISOString() } } } as never)
    .eq("id", orgId);
  if (error) logger.warn("exportacao_download_nao_registrado", { orgId, etapa: "escrita" });
}

/** Repassa a stream e chama `aoTerminar` só quando ela foi entregue inteira. */
export function avisarAoTerminar(
  fonte: ReadableStream<Uint8Array>,
  aoTerminar: () => Promise<void>,
): ReadableStream<Uint8Array> {
  const leitor = fonte.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controle) {
      const r = await leitor.read();
      if (!r.done) {
        controle.enqueue(r.value);
        return;
      }
      // O registro nunca derruba a entrega: o arquivo já saiu inteiro.
      await aoTerminar().catch(() => undefined);
      controle.close();
    },
    async cancel(motivo) {
      await leitor.cancel(motivo);
    },
  });
}
