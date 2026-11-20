/**
 * Biblioteca de mídia do chatbot: os arquivos que os passos "Enviar mídia" de
 * TODOS os fluxos da organização já usam, para reaproveitar num passo novo sem
 * subir de novo (a "biblioteca de mídia" da Umbler). PURO.
 *
 * Sai dos desenhos e não de uma listagem do Storage porque é o desenho que
 * guarda o nome do arquivo e o tipo — no Storage ele é só um uuid. E só entra
 * caminho da pasta de chatbot DESTA organização (`caminhoDoChatbotDaOrg`): a
 * mesma régua do envio, que se recusa a copiar arquivo de fora dela.
 */
import { caminhoDoChatbotDaOrg } from "./midia";
import { grafoSchema, lerConfig, type TipoDeMidia } from "./passos";

export type MidiaDaBiblioteca = {
  storage_path: string;
  tipo: TipoDeMidia;
  mime: string;
  nome_arquivo: string;
  /** Fluxo em que o arquivo apareceu primeiro (só para a tela dizer de onde veio). */
  fluxo: string;
};

export function bibliotecaDeMidias(
  fluxos: { name: string; grafo: unknown }[],
  organizationId: string,
): MidiaDaBiblioteca[] {
  const vistas = new Map<string, MidiaDaBiblioteca>();
  for (const f of fluxos) {
    const g = grafoSchema.safeParse(f.grafo);
    if (!g.success) continue;
    for (const no of g.data.nodes) {
      if (no.type !== "enviar_midia") continue;
      const c = lerConfig("enviar_midia", no.data);
      if (!c.storage_path || !c.tipo || vistas.has(c.storage_path)) continue;
      if (!caminhoDoChatbotDaOrg(c.storage_path, organizationId)) continue;
      vistas.set(c.storage_path, {
        storage_path: c.storage_path,
        tipo: c.tipo,
        mime: c.mime,
        nome_arquivo: c.nome_arquivo,
        fluxo: f.name,
      });
    }
  }
  return [...vistas.values()].sort((a, b) =>
    (a.nome_arquivo || a.storage_path).localeCompare(b.nome_arquivo || b.storage_path, "pt-BR"),
  );
}
