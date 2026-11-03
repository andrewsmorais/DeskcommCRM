/**
 * Copiar e colar passos: só os marcados e as ligações ENTRE eles; colar dá
 * id novo, religa e põe no lugar pedido; o segredo do WebHook não viaja.
 */
import { describe, expect, it } from "vitest";

import { colarPassos, copiarPassos, lerCopiados } from "./area-de-transferencia";

const passo = (
  id: string,
  type: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
) => ({
  id,
  type,
  position: { x, y },
  data,
});
const nodes = [
  passo("a", "enviar_mensagem", 100, 100, { texto: "Oi" }),
  passo("b", "pedir_escolher", 100, 300, { pergunta: "?", opcoes: ["Sim"] }),
  passo("c", "webhook", 400, 300, {
    url: "https://x",
    segredo_enc: "cifrado",
    autorizacao_enc: null,
  }),
];
const edges = [
  { source: "a", target: "b", sourceHandle: "proximo" },
  { source: "b", target: "c", sourceHandle: "opcao-0" },
];

describe("copiar e colar passos", () => {
  it("copia só os marcados e as ligações entre eles", () => {
    const c = copiarPassos(nodes, edges, ["a", "b"])!;
    expect(c.passos.map((p) => p.id)).toEqual(["a", "b"]);
    expect(c.ligacoes).toEqual([{ source: "a", target: "b", sourceHandle: "proximo" }]);
    expect(copiarPassos(nodes, edges, [])).toBeNull();
  });

  it("colar dá id novo, religa e põe o grupo no lugar pedido, mantendo o desenho", () => {
    const c = copiarPassos(nodes, edges, ["a", "b"])!;
    let n = 0;
    const r = colarPassos(c, () => `novo-${++n}`, { x: 1000, y: 500 });
    expect(r.passos.map((p) => [p.id, p.position])).toEqual([
      ["novo-1", { x: 1000, y: 500 }],
      ["novo-2", { x: 1000, y: 700 }],
    ]);
    expect(r.ligacoes).toEqual([
      { id: "novo-1-proximo-novo-2", source: "novo-1", target: "novo-2", sourceHandle: "proximo" },
    ]);
    // O original continua intacto (cópia, não referência).
    (r.passos[0]!.data as { texto: string }).texto = "mudou";
    expect((nodes[0]!.data as { texto: string }).texto).toBe("Oi");
  });

  it("o segredo do WebHook não viaja, e a tela fica sabendo", () => {
    const c = copiarPassos(nodes, edges, ["c"])!;
    const r = colarPassos(c, () => "w", { x: 0, y: 0 });
    expect(r.passos[0]!.data).toMatchObject({
      url: "https://x",
      segredo_enc: null,
      autorizacao_enc: null,
    });
    expect(r.semSegredo).toBe(true);
    expect(
      colarPassos(copiarPassos(nodes, edges, ["a"])!, () => "m", { x: 0, y: 0 }).semSegredo,
    ).toBe(false);
  });

  it("o que vem do armazenamento é conferido: lixo e passo inexistente ficam de fora", () => {
    expect(lerCopiados("lixo")).toBeNull();
    expect(lerCopiados(JSON.stringify({ versao: 2, passos: [], ligacoes: [] }))).toBeNull();
    const c = lerCopiados(
      JSON.stringify({
        versao: 1,
        passos: [passo("a", "enviar_mensagem", 0, 0), passo("z", "passo_que_nao_existe", 0, 0)],
        ligacoes: [{ source: "a", target: "z", sourceHandle: null }],
      }),
    )!;
    expect(c.passos.map((p) => p.id)).toEqual(["a"]);
    expect(c.ligacoes).toEqual([]);
  });
});
