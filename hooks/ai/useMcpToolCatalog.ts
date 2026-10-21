"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { CapacidadeServida } from "@/lib/mcp/tools/catalogo-servido";
import type { CapacidadeSelecionavel } from "@/lib/mcp/tools/selecao-por-pacote";

export type McpToolMeta = CapacidadeServida & CapacidadeSelecionavel;

interface ApiResponse {
  data: {
    tools: CapacidadeServida[];
    desligadas_pela_organizacao?: string[];
  };
}

/** O mesmo catálogo autorizado alimenta o editor e os modelos iniciais. */
export function useMcpToolCatalog() {
  return useQuery({
    queryKey: ["mcp", "tools"],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse>("/api/v1/mcp/tools");
      return {
        tools: res.data.tools.map((tool) => ({ ...tool, name: tool.id })),
        desligadas: res.data.desligadas_pela_organizacao ?? [],
      };
    },
    staleTime: 60_000,
  });
}
