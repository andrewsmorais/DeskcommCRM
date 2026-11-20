/**
 * A PRÉVIA do texto com um contato de exemplo — pelo MESMO renderizador que a
 * mensagem de verdade usa em cada tela, para a prévia nunca prometer o que o
 * envio não faz.
 */
import { renderTemplate } from "@/lib/automation/template";
import { renderizar } from "@/lib/campanhas/renderizador";
import { interpolateTemplate } from "@/lib/inbox/template-vars";

import type { FonteDeVariavel } from "./catalogo";

export const CONTATO_DE_EXEMPLO = {
  name: "Ana Souza",
  phone_number: "+5511999998888",
  email: "ana@exemplo.com",
};

export function previaDoTexto(texto: string, fonte: FonteDeVariavel, agora: Date = new Date()): string {
  if (fonte === "automacao") {
    return renderTemplate(texto, {
      contact: CONTATO_DE_EXEMPLO,
      lead: { title: "Pedido #123" },
    });
  }
  if (fonte === "inbox") return interpolateTemplate(texto, { name: CONTATO_DE_EXEMPLO.name });
  return renderizar(texto, { nome: CONTATO_DE_EXEMPLO.name }, { agora, fuso: "America/Sao_Paulo" }).texto;
}
