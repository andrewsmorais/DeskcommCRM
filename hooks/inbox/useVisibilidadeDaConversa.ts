"use client";
/**
 * Ocultar ou mostrar uma conversa (POST /api/v1/conversations/[id]/visibilidade).
 * O que "oculta" significa mora em `lib/inbox/visibilidade.ts` (migration 0510).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Visibilidade } from "@/lib/inbox/visibilidade";

export function useVisibilidadeDaConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { conversation_id: string; visibilidade: Visibilidade }) =>
      apiClient.post<{ data: { id: string; visibilidade: Visibilidade } }>(
        `/api/v1/conversations/${args.conversation_id}/visibilidade`,
        { visibilidade: args.visibilidade },
      ),
    onError: showApiError,
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
}
