/**
 * O livro do assistente de ajuda (`ajuda_mensagens`, migration 0494).
 *
 * Service role: todo acesso filtra `organization_id`, que vem da sessão
 * validada pela rota — nunca do corpo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Mensagens por organização numa janela de 24 horas (decisão do dono, 28/10/2026). */
export const LIMITE_DE_MENSAGENS_POR_DIA = 50;
/** A pergunta é texto livre do cliente: não guarda além disto. */
export const RETENCAO_DA_AJUDA_DIAS = 90;

const DIA_MS = 24 * 60 * 60 * 1000;

export function criarRegistroDaAjuda(admin: SupabaseClient, agora: () => Date = () => new Date()) {
  return {
    async usadasNasUltimas24h(organizationId: string): Promise<number> {
      const desde = new Date(agora().getTime() - DIA_MS).toISOString();
      const { count, error } = await admin
        .from("ajuda_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", desde);
      if (error) throw new Error(`ajuda: contagem falhou: ${error.message}`);
      return count ?? 0;
    },

    async registrar(linha: {
      organizationId: string;
      userId: string;
      pergunta: string;
      resposta: string | null;
      escalou: boolean;
      tela: string | null;
      uso: { entrada: number; cache: number; saida: number } | null;
    }): Promise<string | null> {
      const { data, error } = await admin
        .from("ajuda_mensagens")
        .insert({
          organization_id: linha.organizationId,
          user_id: linha.userId,
          pergunta: linha.pergunta,
          resposta: linha.resposta,
          escalou: linha.escalou,
          tela: linha.tela,
          tokens_entrada: linha.uso?.entrada ?? null,
          tokens_cache: linha.uso?.cache ?? null,
          tokens_saida: linha.uso?.saida ?? null,
        })
        .select("id")
        .single();
      // Poda da própria organização, no mesmo passo: nada fica além do prazo
      // para quem usa, sem cron novo no scheduler de quem já instalou.
      const limite = new Date(agora().getTime() - RETENCAO_DA_AJUDA_DIAS * DIA_MS).toISOString();
      await admin
        .from("ajuda_mensagens")
        .delete()
        .eq("organization_id", linha.organizationId)
        .lt("created_at", limite);
      if (error) throw new Error(`ajuda: registro falhou: ${error.message}`);
      return (data?.id as string | undefined) ?? null;
    },
  };
}
