"use client";
/**
 * Privar ou liberar uma conversa (POST /api/v1/conversations/[id]/privacy).
 * Quem pode e o que "privada" significa mora na rota e na RLS (migration 0495).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export function usePrivacidadeDaConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { conversation_id: string; is_private: boolean }) =>
      apiClient.post<{ data: { id: string; is_private: boolean } }>(
        `/api/v1/conversations/${args.conversation_id}/privacy`,
        { is_private: args.is_private },
      ),
    onError: showApiError,
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
    },
  });
}
