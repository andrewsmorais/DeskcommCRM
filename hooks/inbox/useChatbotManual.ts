"use client";
/**
 * Os chatbots que um atendente pode acionar numa conversa ("Iniciar
 * manualmente") e o gesto de acionar. A lista só traz fluxo LIGADO com o passo
 * "Iniciar manualmente" — sem nenhum, a Inbox nem mostra o botão.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

type FluxoDaLista = { id: string; name: string; is_active: boolean; inicia_manualmente?: boolean };

export function useChatbotsManuais() {
  return useQuery({
    queryKey: ["chatbot-flows", "manuais"],
    queryFn: async () => {
      const r = await apiClient.get<{ data: FluxoDaLista[] }>("/api/v1/chatbot-flows");
      return (r.data ?? []).filter((f) => f.is_active && f.inicia_manualmente);
    },
    staleTime: 60_000,
  });
}

export function useIniciarChatbot(mensagemDeSucesso: string) {
  return useMutation({
    mutationFn: async (args: { conversation_id: string; flow_id: string }) =>
      apiClient.post<{ data: { iniciado: boolean } }>(
        `/api/v1/conversations/${args.conversation_id}/chatbot`,
        { flow_id: args.flow_id },
      ),
    onError: showApiError,
    onSuccess: () => toast.success(mensagemDeSucesso),
  });
}
