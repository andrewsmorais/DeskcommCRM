// @vitest-environment node
import { describe, expect, it } from "vitest";

import { lerAteOTeto } from "./webhook";

function respostaEmPedacos(pedacos: number, tamanho: number) {
  let enviados = 0;
  let cancelado = false;
  const corpo = new ReadableStream<Uint8Array>({
    pull(c) {
      if (enviados >= pedacos) return c.close();
      enviados++;
      c.enqueue(new Uint8Array(tamanho).fill(97));
    },
    cancel() {
      cancelado = true;
    },
  });
  return { res: new Response(corpo), lidos: () => enviados, cancelado: () => cancelado };
}

describe("WebHook do chatbot: a resposta é lida só até o teto", () => {
  it("resposta enorme para no teto e o resto NÃO é lido (auditoria de 14/11)", async () => {
    const r = respostaEmPedacos(10_000, 16 * 1024); // 160 MB se fosse lido inteiro
    const texto = await lerAteOTeto(r.res, 64 * 1024);
    expect(texto).toHaveLength(64 * 1024);
    expect(r.lidos()).toBeLessThanOrEqual(6);
    expect(r.cancelado()).toBe(true);
  });

  it("resposta pequena vem inteira; sem corpo, vazio", async () => {
    expect(await lerAteOTeto(new Response('{"ok":true}'), 64 * 1024)).toBe('{"ok":true}');
    expect(await lerAteOTeto(new Response(null), 64 * 1024)).toBe("");
  });
});
