"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { Contact } from "@/lib/types/contacts";

/** As duas marcas do contato que vetam o automático (migration 0540). */
export type MarcaDoContato = "personal" | "always-human";

/**
 * Liga (POST) ou desliga (DELETE) uma marca. Invalida as mesmas chaves de
 * `useUnblockContact`: o Inbox lê o contato por `conversation.contacts`.
 */
export function useMarcaDoContato(id: string, marca: MarcaDoContato) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ligar: boolean) =>
      ligar
        ? apiClient.post<{ data: Contact }>(`/api/v1/contacts/${id}/${marca}`, {})
        : apiClient.delete<{ data: Contact }>(`/api/v1/contacts/${id}/${marca}`),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
