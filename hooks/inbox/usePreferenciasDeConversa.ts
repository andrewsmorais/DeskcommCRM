"use client";
/**
 * Configurações › Conversas lidas pela tela de conversa: a regra de assinatura,
 * o comportamento do Fechar e o perfil de quem está logado. E a chave "Assinar"
 * do campo de mensagem, que fica lembrada neste navegador.
 */
import { useCallback, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { PreferenciasDeConversa } from "@/lib/conversas/preferencias";

export type PreferenciasComPerfil = PreferenciasDeConversa & {
  meu: { nome: string | null; assinatura: string | null; mensagem_de_finalizacao: string | null };
};

const CHAVE = ["settings", "conversas"] as const;

export function usePreferenciasDeConversa() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: async () =>
      (await apiClient.get<{ data: PreferenciasComPerfil }>("/api/v1/settings/conversas")).data,
    staleTime: 60_000,
  });
}

export function useSalvarMinhaAssinatura(mensagemDeSucesso: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assinatura: string) =>
      apiClient.patch<{ data: { assinatura: string | null } }>("/api/v1/me/assinatura", { assinatura }),
    onError: showApiError,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE });
      toast.success(mensagemDeSucesso);
    },
  });
}

const GUARDADO = "chataionline.assinar";

/** A chave "Assinar" do atendente — lembrada neste navegador. */
export function lerAssinarLembrado(): boolean {
  try {
    return window.localStorage.getItem(GUARDADO) === "1";
  } catch {
    return false;
  }
}

const AVISO = "chataionline:assinar";

function inscrever(aoMudar: () => void): () => void {
  window.addEventListener(AVISO, aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(AVISO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

/**
 * A chave "Assinar" do atendente — lembrada neste navegador. Por
 * `useSyncExternalStore` e não por inicializador de `useState`: o servidor não
 * tem navegador, e ler o armazenamento no primeiro render faria o HTML do
 * servidor divergir do cliente.
 */
export function useAssinarLembrado(): [boolean, (v: boolean) => void] {
  const valor = useSyncExternalStore(inscrever, lerAssinarLembrado, () => false);
  const definir = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(GUARDADO, v ? "1" : "0");
    } catch {
      /* navegador sem armazenamento: a chave não fica lembrada */
    }
    window.dispatchEvent(new Event(AVISO));
  }, []);
  return [valor, definir];
}
