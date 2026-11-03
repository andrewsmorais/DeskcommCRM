/**
 * "Organizar blocos automaticamente" e "Ver ideias de bot" do editor.
 */
import { describe, expect, it } from "vitest";

import { IDEIAS_DE_BOT, montarIdeia, passosDaIdeia } from "./ideias";
import { organizarBlocos } from "./organizar";
import { ehTipoDePasso, grafoSchema, saidasDoPasso } from "./passos";
import { PASSOS_AVANCADOS } from "./passos-avancados";

const no = (id: string, type: string) => ({ id, type, position: { x: 500, y: -300 } });

describe("organizar blocos", () => {
  it("cada passo fica abaixo de quem leva até ele", () => {
    const pos = organizarBlocos(
      [
        no("a", "inicio_canal"),
        no("b", "enviar_mensagem"),
        no("c", "pedir_escolher"),
        no("d", "finalizar_conversa"),
      ],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "d" },
      ],
    );
    expect(pos.get("a")!.y).toBeLessThan(pos.get("b")!.y);
    expect(pos.get("b")!.y).toBeLessThan(pos.get("c")!.y);
    expect(pos.get("c")!.y).toBeLessThan(pos.get("d")!.y);
  });

  it("ramos do mesmo passo ficam na mesma linha, lado a lado", () => {
    const pos = organizarBlocos(
      [
        no("a", "inicio_canal"),
        no("m", "pedir_escolher"),
        no("x", "enviar_mensagem"),
        no("y", "enviar_mensagem"),
      ],
      [
        { source: "a", target: "m" },
        { source: "m", target: "x" },
        { source: "m", target: "y" },
      ],
    );
    expect(pos.get("x")!.y).toBe(pos.get("y")!.y);
    expect(pos.get("x")!.x).not.toBe(pos.get("y")!.x);
  });

  it("um laço (voltar ao menu) não trava nem empurra o fluxo para baixo sem fim", () => {
    const pos = organizarBlocos(
      [no("a", "inicio_canal"), no("m", "pedir_escolher"), no("x", "enviar_mensagem")],
      [
        { source: "a", target: "m" },
        { source: "m", target: "x" },
        { source: "x", target: "m" },
      ],
    );
    expect(pos.get("m")!.y).toBeLessThan(pos.get("x")!.y);
    expect(pos.size).toBe(3);
  });

  it("bloco de notas e passo solto vão para a coluna da direita", () => {
    const pos = organizarBlocos(
      [
        no("a", "inicio_canal"),
        no("b", "enviar_mensagem"),
        no("n", "bloco_de_notas"),
        no("s", "criar_nota"),
      ],
      [{ source: "a", target: "b" }],
    );
    const direitaDoFluxo = Math.max(pos.get("a")!.x, pos.get("b")!.x);
    expect(pos.get("n")!.x).toBeGreaterThan(direitaDoFluxo);
    expect(pos.get("s")!.x).toBe(pos.get("n")!.x);
  });
});

describe("ideias de bot", () => {
  let n = 0;
  const novoId = () => `id-${++n}`;

  it.each(IDEIAS_DE_BOT.map((i) => [i.id, i] as const))(
    "%s: só passos que existem, ligados por saídas reais",
    (_, ideia) => {
      const g = montarIdeia(ideia, novoId, { x: 100, y: 50 });
      expect(grafoSchema.safeParse(g).success).toBe(true);
      expect(g.nodes.some((x) => x.type.startsWith("inicio_"))).toBe(true);
      const porId = new Map(g.nodes.map((x) => [x.id, x]));
      for (const e of g.edges) {
        const origem = porId.get(e.source)!;
        expect(porId.has(e.target)).toBe(true);
        expect(ehTipoDePasso(origem.type)).toBe(true);
        const saidas = saidasDoPasso(origem.type as never, origem.data).map((s) => s.id);
        expect(saidas).toContain(e.sourceHandle);
      }
      // Começa onde a tela pediu (ao lado do que já está no quadro).
      expect(Math.min(...g.nodes.map((x) => x.position.x))).toBe(100);
      expect(Math.min(...g.nodes.map((x) => x.position.y))).toBe(50);
    },
  );

  it("sabe quais ideias usam passo do chatbot avançado", () => {
    const formulario = IDEIAS_DE_BOT.find((i) => i.id === "coletar_dados")!;
    expect(passosDaIdeia(formulario).some((p) => PASSOS_AVANCADOS.has(p))).toBe(true);
    const menu = IDEIAS_DE_BOT.find((i) => i.id === "menu")!;
    expect(passosDaIdeia(menu).some((p) => PASSOS_AVANCADOS.has(p))).toBe(false);
  });
});
