"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { motivoDaFalhaDaMensagem } from "@/lib/inbox/motivo-da-falha";

/** Recarrega o fio após o canal confirmar, sem fingir sucesso antes da resposta. */
export function useAlterarMensagem(conversationId: string | null) {
  const qc = useQueryClient();
  const t = useT();
  const editar = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiClient.patch(`/api/v1/messages/${id}`, { text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(t("Mensagem editada."));
    },
    onError: showApiError,
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/messages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(t("Mensagem apagada para todos."));
    },
    onError: showApiError,
  });
  const ocultar = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/v1/messages/${id}/hide`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(t("Mensagem ocultada no CRM."));
    },
    onError: showApiError,
  });
  const restaurar = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/messages/${id}/hide`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(t("Mensagem restaurada no CRM."));
    },
    onError: showApiError,
  });
  // Enviar de novo a mensagem que falhou (vindo do produto original). A mesma
  // linha é reusada: dois toques nunca mandam duas vezes.
  const reenviar = useMutation({
    mutationFn: ({ id, confirmado }: { id: string; confirmado: boolean }) =>
      apiClient.post<{ data: { status: string; error_code: string | null; error_message: string | null } }>(
        `/api/v1/messages/${id}/retry`,
        confirmado ? { confirmado: true } : {},
      ),
    // O canal recusou de novo: a rota responde 200 com a linha em `failed`.
    onSuccess: (res) => {
      const msg = res?.data;
      if (msg?.status !== "failed") return;
      toast.error(t("A mensagem não saiu de novo."), { description: motivoDaFalhaDaMensagem(msg, t) });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "confirmacao_necessaria") return;
      showApiError(err);
    },
  });
  return { editar, apagar, ocultar, restaurar, reenviar };
}
