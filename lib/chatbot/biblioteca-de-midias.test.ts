/**
 * Biblioteca de mídia: os arquivos dos "Enviar mídia" de todos os fluxos da
 * organização, sem repetir, e só os da pasta de chatbot DESTA organização — o
 * mesmo limite que o envio respeita.
 */
import { describe, expect, it } from "vitest";

import { bibliotecaDeMidias } from "./biblioteca-de-midias";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const midia = (id: string, storage_path: string, nome_arquivo: string, tipo = "image") => ({
  id,
  type: "enviar_midia",
  position: { x: 0, y: 0 },
  data: { storage_path, tipo, mime: "image/jpeg", nome_arquivo },
});
const fluxo = (name: string, nodes: unknown[]) => ({ name, grafo: { nodes, edges: [] } });

describe("biblioteca de mídia", () => {
  it("junta os arquivos de todos os fluxos, sem repetir, em ordem de nome", () => {
    const lista = bibliotecaDeMidias(
      [
        fluxo("Vendas", [
          midia("a", `${ORG}/chatbot/f1/x.jpg`, "tabela.jpg"),
          midia("b", `${ORG}/chatbot/f1/y.pdf`, "cardapio.pdf", "document"),
        ]),
        fluxo("Suporte", [midia("c", `${ORG}/chatbot/f1/x.jpg`, "tabela.jpg")]),
      ],
      ORG,
    );
    expect(lista.map((m) => [m.nome_arquivo, m.fluxo])).toEqual([
      ["cardapio.pdf", "Vendas"],
      ["tabela.jpg", "Vendas"],
    ]);
  });

  it("arquivo de outra organização, caminho torto, sem arquivo ou desenho quebrado ficam de fora", () => {
    expect(
      bibliotecaDeMidias(
        [
          fluxo("A", [
            midia("a", `${OUTRA}/chatbot/f/x.jpg`, "alheio.jpg"),
            midia("b", `${ORG}/chatbot/../x.jpg`, "torto.jpg"),
            { id: "c", type: "enviar_midia", position: { x: 0, y: 0 }, data: {} },
          ]),
          { name: "B", grafo: "lixo" },
        ],
        ORG,
      ),
    ).toEqual([]);
  });
});
