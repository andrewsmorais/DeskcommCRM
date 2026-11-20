"use client";
/**
 * Mensagens agendadas da conversa (migration 0511): listar, agendar, editar e
 * cancelar. A régua (tipos, horário mínimo e máximo) mora em lib/agendadas/regras.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { AgendadaInput, MensagemAgendada } from "@/lib/agendadas/regras";

const chave = (conversationId: string) => ["mensagens-agendadas", conversationId] as const;

export function useMensagensAgendadas(conversationId: string, enabled = true) {
  return useQuery({
    queryKey: chave(conversationId),
    enabled,
    queryFn: async () =>
      (
        await apiClient.get<{ data: MensagemAgendada[] }>(
          `/api/v1/conversations/${conversationId}/agendadas`,
        )
      ).data ?? [],
    // A linha muda sozinha (o worker envia no horário): relê de tempos em tempos.
    refetchInterval: 30_000,
  });
}

export function useAgendarMensagem(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { input: AgendadaInput; agendadaId?: string }) =>
      args.agendadaId
        ? apiClient.patch<{ data: MensagemAgendada }>(
            `/api/v1/conversations/${conversationId}/agendadas/${args.agendadaId}`,
            args.input,
          )
        : apiClient.post<{ data: MensagemAgendada }>(
            `/api/v1/conversations/${conversationId}/agendadas`,
            args.input,
          ),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(conversationId) }),
  });
}

export function useCancelarAgendada(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agendadaId: string) =>
      apiClient.delete<{ data: MensagemAgendada }>(
        `/api/v1/conversations/${conversationId}/agendadas/${agendadaId}`,
      ),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(conversationId) }),
  });
}
