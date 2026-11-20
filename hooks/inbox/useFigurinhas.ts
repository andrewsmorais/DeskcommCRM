"use client";
/** A biblioteca de figurinhas da empresa e o envio na conversa (migration 0516). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { ApiError, type ApiErrorBody } from "@/lib/api/types";

export type Figurinha = { id: string; url: string | null; created_at: string };
const CHAVE = ["figurinhas"] as const;

export function useFigurinhas(ligado: boolean) {
  return useQuery({
    queryKey: CHAVE,
    enabled: ligado,
    queryFn: async () => (await apiClient.get<{ data: Figurinha[] }>("/api/v1/figurinhas")).data ?? [],
    // O link assinado vale 1 hora; 30 minutos de folga.
    staleTime: 30 * 60_000,
    retry: false,
  });
}

/** Guarda do computador (`file`) ou de uma mensagem recebida (`message_id`). */
export function useSalvarFigurinha(mensagemDeSucesso: string, mensagemJaExistia: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { file: File } | { message_id: string }) => {
      if ("file" in args) {
        const form = new FormData();
        form.append("file", args.file, args.file.name);
        const res = await fetch("/api/v1/figurinhas", { method: "POST", body: form });
        const json = (await res.json()) as Partial<ApiErrorBody> & { data?: { id: string; ja_existia: boolean } };
        if (!res.ok || !json.data) {
          const e = json.error;
          throw new ApiError(res.status, e?.code ?? "upload_failed", e?.details, e?.request_id ?? "", e?.message);
        }
        return json.data;
      }
      return (await apiClient.post<{ data: { id: string; ja_existia: boolean } }>("/api/v1/figurinhas", args)).data;
    },
    onError: showApiError,
    onSuccess: (r) => {
      toast.success(r.ja_existia ? mensagemJaExistia : mensagemDeSucesso);
      void qc.invalidateQueries({ queryKey: CHAVE });
    },
  });
}

export function useApagarFigurinha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/figurinhas/${id}`),
    onError: showApiError,
    onSettled: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useEnviarFigurinha(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (figurinhaId: string) =>
      apiClient.post(`/api/v1/conversations/${conversationId}/figurinha`, { figurinha_id: figurinhaId }),
    onError: showApiError,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
  });
}
