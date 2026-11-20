/**
 * Variáveis no texto do follow-up — PURO.
 *
 * O aviso da loja (Shopify, Yampi, Kiwify…) grava no negócio `produto`,
 * `valor`, `link_checkout` e `pix_copia_e_cola`. A recuperação de carrinho no
 * Essencial é um follow-up de TEXTO (sem IA), e sem as variáveis ele não
 * conseguia dizer o que ficou no carrinho nem mandar o link (decisão do dono,
 * 20/11/2026, de a recuperação valer em todos os planos).
 *
 * O texto passa pelo MESMO renderizador das automações e das mensagens prontas
 * (`lib/automation/template.ts`): `{{nome}}`, `{{primeiro_nome}}`, a reserva
 * `{{primeiro_nome|"cliente"}}` e os campos do negócio pelo nome
 * (`{{produto}}`, `{{link_checkout}}`) ou pelo caminho (`{{lead.custom_fields.x}}`).
 * Antes o texto do follow-up saía cru, e a dica da tela prometia a reserva.
 */
import { renderTemplate } from "@/lib/automation/template";

export function preencherCamposDoNegocio(
  texto: string,
  lead: { contact_name?: string | null; custom_fields?: Record<string, unknown> } | null | undefined,
): string {
  if (!texto.includes("{{")) return texto;
  const campos = lead?.custom_fields ?? {};
  return renderTemplate(texto, {
    ...campos,
    contact: { name: lead?.contact_name ?? "" },
    lead: { custom_fields: campos },
  });
}
