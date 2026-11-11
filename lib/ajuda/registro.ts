/**
 * O livro do assistente de ajuda (`ajuda_mensagens`, migration 0494).
 *
 * Service role: todo acesso filtra `organization_id`, que vem da sessão
 * validada pela rota — nunca do corpo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { comReservaDeCota } from "@/lib/billing/reserva";

/** Mensagens por organização numa janela de 24 horas (decisão do dono, 28/10/2026). */
export const LIMITE_DE_MENSAGENS_POR_DIA = 50;
/** A pergunta é texto livre do cliente: não guarda além disto. */
export const RETENCAO_DA_AJUDA_DIAS = 90;

const DIA_MS = 24 * 60 * 60 * 1000;

export function criarRegistroDaAjuda(admin: SupabaseClient, agora: () => Date = () => new Date()) {
  const registro = {
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

    /**
     * A VAGA DO DIA, TOMADA ANTES DA CHAMADA PAGA.
     *
     * Contar, chamar o modelo e só depois gravar era conferir-e-agir: N
     * perguntas simultâneas liam a mesma contagem abaixo do teto e todas
     * pagavam a chamada (60 de 60 respondidas contra um teto de 50, medido na
     * auditoria). E a gravação que falhava era engolida — a resposta saía e a
     * conta não andava.
     *
     * Agora contar e gravar a linha da pergunta acontecem DENTRO da reserva da
     * organização (`comReservaDeCota`, o mesmo lease das cotas do plano): só um
     * pedido por vez passa por aqui, e quem chega depois já vê a linha do
     * anterior. A linha nasce com `resposta` nula e é completada por
     * `concluir`. Qualquer falha — reserva, contagem ou gravação — LANÇA, e a
     * rota recusa sem chamar o modelo (fail-closed).
     *
     * A linha conta mesmo que o modelo falhe depois: a chamada paga pode ter
     * acontecido, e devolver a vaga numa falha reabriria a porta que a reserva
     * fecha.
     *
     * `null` = o teto do dia já foi atingido.
     */
    async reservar(linha: {
      organizationId: string;
      userId: string;
      pergunta: string;
      tela: string | null;
    }): Promise<{ id: string; usadas: number } | null> {
      return comReservaDeCota(linha.organizationId, "ajuda", async () => {
        const usadas = await registro.usadasNasUltimas24h(linha.organizationId);
        if (usadas >= LIMITE_DE_MENSAGENS_POR_DIA) return null;
        const { data, error } = await admin
          .from("ajuda_mensagens")
          .insert({
            organization_id: linha.organizationId,
            user_id: linha.userId,
            pergunta: linha.pergunta,
            resposta: null,
            escalou: false,
            tela: linha.tela,
          })
          .select("id")
          .single();
        if (error || !data?.id) {
          throw new Error(`ajuda: reserva da mensagem falhou: ${error?.message ?? "sem id"}`);
        }
        // Poda da própria organização, no mesmo passo: nada fica além do prazo
        // para quem usa, sem cron novo no scheduler de quem já instalou.
        const limite = new Date(agora().getTime() - RETENCAO_DA_AJUDA_DIAS * DIA_MS).toISOString();
        await admin
          .from("ajuda_mensagens")
          .delete()
          .eq("organization_id", linha.organizationId)
          .lt("created_at", limite);
        return { id: data.id as string, usadas: usadas + 1 };
      });
    },

    /** Completa a linha reservada com a resposta e o uso. A vaga já foi contada. */
    async concluir(
      organizationId: string,
      id: string,
      resultado: {
        resposta: string;
        escalou: boolean;
        uso: { entrada: number; cache: number; saida: number } | null;
      },
    ): Promise<void> {
      const { error } = await admin
        .from("ajuda_mensagens")
        .update({
          resposta: resultado.resposta,
          escalou: resultado.escalou,
          tokens_entrada: resultado.uso?.entrada ?? null,
          tokens_cache: resultado.uso?.cache ?? null,
          tokens_saida: resultado.uso?.saida ?? null,
        })
        .eq("organization_id", organizationId)
        .eq("id", id);
      if (error) throw new Error(`ajuda: registro da resposta falhou: ${error.message}`);
    },
  };
  return registro;
}
