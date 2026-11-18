import { describe, expect, it } from "vitest";

import { formatarDuracao, montarLinhasDeEtiqueta, type LinhaEtiquetaBruta } from "./etiquetas";

const linha = (p: Partial<LinhaEtiquetaBruta>): LinhaEtiquetaBruta => ({
  tag: "vip",
  conversations_handled: 1,
  avg_first_response_seconds: 60,
  median_first_response_seconds: 60,
  sem_resposta: 0,
  ...p,
});

describe("montarLinhasDeEtiqueta", () => {
  it("ordena por volume e desempata pelo nome", () => {
    const r = montarLinhasDeEtiqueta([
      linha({ tag: "b", conversations_handled: 2 }),
      linha({ tag: "a", conversations_handled: 2 }),
      linha({ tag: "c", conversations_handled: 5 }),
    ]);
    expect(r.map((l) => l.tag)).toEqual(["c", "a", "b"]);
  });

  it("null continua null (não vira 0) na média e na mediana", () => {
    const [l] = montarLinhasDeEtiqueta([
      linha({ avg_first_response_seconds: null, median_first_response_seconds: null }),
    ]);
    expect(l!.avg_first_response_seconds).toBeNull();
    expect(l!.median_first_response_seconds).toBeNull();
    expect(formatarDuracao(l!.median_first_response_seconds)).toBe("—");
  });

  it("descarta linha sem etiqueta e aguenta entrada ruim", () => {
    expect(montarLinhasDeEtiqueta([linha({ tag: "  " })])).toEqual([]);
    expect(montarLinhasDeEtiqueta(null)).toEqual([]);
    expect(montarLinhasDeEtiqueta(undefined)).toEqual([]);
  });

  it("não recalcula números: preserva os da RPC", () => {
    const [l] = montarLinhasDeEtiqueta([linha({ conversations_handled: 7, sem_resposta: 3 })]);
    expect(l).toMatchObject({ conversations_handled: 7, sem_resposta: 3 });
  });
});
