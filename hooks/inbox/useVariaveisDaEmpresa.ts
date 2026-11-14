"use client";
/**
 * As variáveis da empresa (Configurações › Variáveis da empresa), para o campo
 * de mensagem preencher {{empresa.chave}} nas respostas rápidas e o editor de
 * chatbot mostrar o que existe. Já vem com o prefixo pronto para substituir.
 */
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { comPrefixoDaEmpresa, type VariavelDaEmpresa } from "@/lib/empresa/variaveis";

export function useVariaveisDaEmpresa() {
  return useQuery({
    queryKey: ["settings", "variaveis"] as const,
    queryFn: async () =>
      (await apiClient.get<{ data: { variaveis: VariavelDaEmpresa[] } }>("/api/v1/settings/variaveis")).data
        .variaveis,
    staleTime: 60_000,
  });
}

/** `{ "empresa.chave": "valor" }` — vazio enquanto carrega ou se a leitura falhar. */
export function useVariaveisDaEmpresaPrefixadas(): Record<string, string> {
  const { data } = useVariaveisDaEmpresa();
  return comPrefixoDaEmpresa(data);
}
