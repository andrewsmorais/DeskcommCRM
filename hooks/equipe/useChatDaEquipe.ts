"use client";
/**
 * Chat interno da equipe (migration 0515): a lista de conversas, as mensagens
 * de uma conversa, enviar e marcar como lida. Uma assinatura Realtime em
 * `equipe_mensagens` da organização mantém tudo vivo — a RLS só entrega ao
 * navegador a Geral e as diretas da própria pessoa.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { apiClient } from "@/lib/api/client";
import type { MensagemDaEquipe } from "@/lib/equipe/chat";

export type ConversaDaEquipe = {
  chave: string;
  nome: string;
  ultima: { texto: string; quando: string; autor: string } | null;
  nao_lidas: number;
};
export type ListaDoChat = { eu: string; conversas: ConversaDaEquipe[]; nao_lidas: number };

const CHAVE_LISTA = ["equipe", "conversas"] as const;
const chaveDasMensagens = (com: string | null) => ["equipe", "mensagens", com] as const;

/** Assina as mensagens novas da organização e recarrega o que a tela mostra. */
export function useAoVivoDoChatDaEquipe() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  const orgId = activeOrg?.orgId ?? null;
  const onChange = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["equipe"] });
  }, [qc]);
  useRealtimeChannel({
    name: orgId ? `equipe-chat-${orgId}` : "equipe-chat-off",
    postgresChanges: orgId
      ? { event: "INSERT", schema: "public", table: "equipe_mensagens", filter: `organization_id=eq.${orgId}` }
      : undefined,
    onChange,
    enabled: !!orgId,
  });
}

export function useConversasDaEquipe() {
  return useQuery({
    queryKey: CHAVE_LISTA,
    queryFn: async () => (await apiClient.get<{ data: ListaDoChat }>("/api/v1/equipe/conversas")).data,
    staleTime: 30_000,
  });
}

export function useMensagensDaEquipe(com: string | null) {
  return useQuery({
    queryKey: chaveDasMensagens(com),
    enabled: !!com,
    queryFn: async () =>
      (
        await apiClient.get<{ data: { mensagens: MensagemDaEquipe[]; tem_mais: boolean } }>(
          `/api/v1/equipe/mensagens?com=${encodeURIComponent(com ?? "")}`,
        )
      ).data,
  });
}

export function useEnviarParaEquipe(com: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (corpo: string) =>
      (await apiClient.post<{ data: MensagemDaEquipe }>("/api/v1/equipe/mensagens", { com, corpo })).data,
    onError: showApiError,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipe"] });
    },
  });
}

export function useMarcarLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (com: string) => apiClient.post("/api/v1/equipe/lida", { com }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE_LISTA });
    },
  });
}
