/** Todo passo do catálogo tem o texto do botão "Ajuda", e as variáveis saem do que foi configurado. */
import { describe, expect, it } from "vitest";

import { AJUDA_DOS_PASSOS, paragrafosDaAjuda, variaveisDoPasso } from "./ajuda-dos-passos";
import { PASSOS } from "./passos";

describe("ajuda dos passos", () => {
  it.each(PASSOS.map((p) => [p.tipo] as const))("%s tem explicação", (tipo) => {
    const paragrafos = paragrafosDaAjuda(AJUDA_DOS_PASSOS[tipo]);
    expect(paragrafos.length).toBeGreaterThan(0);
    for (const p of paragrafos) expect(p.length).toBeGreaterThan(20);
    expect(() => variaveisDoPasso(tipo, {})).not.toThrow();
  });

  it("as variáveis exportadas usam os nomes que quem montou escolheu", () => {
    expect(variaveisDoPasso("pedir_digitar", { variavel: "cidade" })).toEqual([
      { nome: "cidade", descricao: "digitado" },
    ]);
    expect(
      variaveisDoPasso("enviar_formulario", {
        perguntas: [{ pergunta: "Seu CPF?", variavel: "cpf" }],
      }),
    ).toEqual([{ nome: "cpf", descricao: "resposta_do_formulario", detalhe: "Seu CPF?" }]);
    expect(
      variaveisDoPasso("webhook", {
        campos: [{ caminho: "pedido.status", variavel: "status_pedido" }],
      }).map((v) => v.nome),
    ).toEqual(["webhook_status", "status_pedido"]);
  });
});
