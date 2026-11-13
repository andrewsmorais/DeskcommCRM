"use client";
/** Favoritar e encaminhar mensagens (paridade com a Umbler; migration 0513). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

export type Favorita = { id: string; type: string; direction: string; body: string | null; sent_at: string; favoritada_em: string };

export function useFavoritas(conversationId: string | null) {
  return useQuery({
    queryKey: ["favoritas", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () =>
      (await apiClient.get<{ data: Favorita[] }>(`/api/v1/conversations/${conversationId}/favoritas`)).data ?? [],
    staleTime: 30_000,
    // Banco ainda sem a 0513: a conversa segue abrindo, só sem estrelas.
    retry: false,
  });
}

export function useFavoritar(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; favorita: boolean }) =>
      args.favorita
        ? apiClient.post(`/api/v1/messages/${args.id}/favorita`, {})
        : apiClient.delete(`/api/v1/messages/${args.id}/favorita`),
    onError: showApiError,
    onSettled: () => void qc.invalidateQueries({ queryKey: ["favoritas", conversationId] }),
  });
}

export function useEncaminhar(mensagemDeSucesso: string) {
  return useMutation({
    mutationFn: async (args: { id: string; conversation_ids: string[] }) =>
      apiClient.post<{ data: { resultados: { conversation_id: string; ok: boolean }[] } }>(
        `/api/v1/messages/${args.id}/encaminhar`,
        { conversation_ids: args.conversation_ids },
      ),
    onError: showApiError,
    onSuccess: (r) => {
      const ok = r.data.resultados.filter((x) => x.ok).length;
      const total = r.data.resultados.length;
      if (ok === total) toast.success(mensagemDeSucesso);
      else toast.error(`${ok}/${total}`);
    },
  });
}
