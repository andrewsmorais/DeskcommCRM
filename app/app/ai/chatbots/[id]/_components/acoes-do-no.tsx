"use client";

/**
 * O que a mini-barra em cima do passo selecionado (duplicar, apagar) pede ao
 * editor (ajuda, duplicar, apagar). O nó do quadro é desenhado pelo React Flow, longe do estado do
 * editor; o contexto leva as duas ações até ele sem passar por `data` (que é o
 * que vai gravado no desenho).
 */
import { createContext, useContext } from "react";

export type AcoesDoNo = {
  /** Abre o painel "Ajuda" do passo. */
  ajuda: (id: string) => void;
  duplicar: (id: string) => void;
  apagar: (id: string) => void;
};

export const AcoesDoNoContext = createContext<AcoesDoNo | null>(null);

export function useAcoesDoNo(): AcoesDoNo | null {
  return useContext(AcoesDoNoContext);
}
