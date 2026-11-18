"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Note } from "@/lib/types/messaging";

interface CreateNoteArgs {
  conversation_id: string;
  body: string;
  /** O anexo que a rota `notes/media` acabou de guardar (migration 0547). */
  anexo?: { storage_path: string; media_mime: string; media_size_bytes: number };
}

export function useCreateNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversation_id, body, anexo }: CreateNoteArgs) =>
      apiClient.post<{ data: Note }>(`/api/v1/conversations/${conversation_id}/notes`, anexo ? { body, anexo } : { body }),
    onSuccess: (_res, args) => {
      qc.invalidateQueries({ queryKey: ["notes", args.conversation_id] });
    },
    onError: showApiError,
  });
}
