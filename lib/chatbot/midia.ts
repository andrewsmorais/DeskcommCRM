/**
 * O arquivo do passo "Enviar mídia" na pasta da conversa.
 *
 * O arquivo é subido uma vez, pela tela, em `whatsapp-media/<org>/chatbot/<fluxo>/…`
 * (`app/api/v1/chatbot-flows/[id]/media`). O envio só aceita arquivo da PRÓPRIA
 * conversa (`isMediaPathOwnedBy`), então ele é COPIADO para lá — o mesmo
 * caminho das fotos do catálogo (`lib/agent-engine/agent/fotos-do-produto.ts`):
 * a conversa mostra o arquivo e a LGPD o apaga junto com ela.
 *
 * O destino é determinístico (`chatbot-<arquivo>`): o mesmo arquivo mandado de
 * novo na mesma conversa, ou o replay de um evento, reaproveita a cópia.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_DA_MIDIA = "whatsapp-media";

/** O arquivo é do chatbot desta organização? (o desenho é gravável pela tela; a cópia é service role) */
export function caminhoDoChatbotDaOrg(caminho: string, organizationId: string): boolean {
  return (
    caminho.startsWith(`${organizationId}/chatbot/`) &&
    !caminho.includes("..") &&
    !caminho.includes("//") &&
    /^[A-Za-z0-9/_.-]+$/.test(caminho)
  );
}

export async function midiaDoChatbotDaOrg(
  admin: SupabaseClient,
  a: { organizationId: string; conversationId: string; origem: string },
): Promise<string | null> {
  if (!caminhoDoChatbotDaOrg(a.origem, a.organizationId)) return null;
  const arquivo = a.origem.split("/").pop();
  if (!arquivo) return null;
  const destino = `${a.organizationId}/${a.conversationId}/chatbot-${arquivo}`;
  const { error } = await admin.storage.from(BUCKET_DA_MIDIA).copy(a.origem, destino);
  if (!error) return destino;
  // Já copiado antes para esta conversa: o arquivo que precisamos está lá.
  if (/already exists/i.test(error.message) || (error as { statusCode?: string }).statusCode === "409")
    return destino;
  return null;
}
