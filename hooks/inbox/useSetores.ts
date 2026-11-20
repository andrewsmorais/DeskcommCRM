"use client";
/**
 * Setores de atendimento (migration 0496) na Inbox: a lista, para o filtro, o
 * selo do cabeçalho e a aba "Setor" do Transferir; e a mudança de setor da
 * conversa (POST /api/v1/conversations/[id]/setor). Quem pode e o que mover
 * para um setor faz mora na rota e em lib/setores/servico.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

export interface SetorDaLista {
  id: string;
  nome: string;
  descricao: string | null;
  membros: string[];
}

export function useSetores(enabled = true) {
  return useQuery({
    queryKey: ["setores"],
    queryFn: async () => apiClient.get<{ data: SetorDaLista[] }>("/api/v1/setores"),
    enabled,
    staleTime: 60_000,
    select: (res) => res.data,
  });
}

export function useMudarSetorDaConversa() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (args: { conversation_id: string; setor_id: string | null }) =>
      apiClient.post<{ data: { id: string; setor_id: string | null; soltou_dono: boolean } }>(
        `/api/v1/conversations/${args.conversation_id}/setor`,
        { setor_id: args.setor_id },
      ),
    onError: showApiError,
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
      toast.success(args.setor_id ? t("Conversa enviada ao setor.") : t("Conversa tirada do setor."));
    },
  });
}
