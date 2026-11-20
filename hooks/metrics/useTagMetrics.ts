"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { LinhaEtiqueta } from "@/lib/metrics/etiquetas";

/** O corpo de `GET /api/v1/metrics/tags`. */
export interface TagMetrics {
  window: { from: string; to: string };
  owner_user_id: string | null;
  tags: LinhaEtiqueta[];
}

/** Quadro "Por etiqueta": mesma janela (30 dias) e mesmo filtro de atendente do quadro por canal. */
export function useTagMetrics(owner: string | null) {
  const qs = owner ? `?owner_user_id=${encodeURIComponent(owner)}` : "";
  return useQuery({
    queryKey: ["metrics", "tags", owner ?? "all"],
    queryFn: async () => apiClient.get<{ data: TagMetrics }>(`/api/v1/metrics/tags${qs}`),
    staleTime: 30_000,
  });
}
