/**
 * O passo WebHook do chatbot só liga com endereço https e servidor sem
 * `{{variável}}`.
 *
 * Auditoria funcional f01 (04/11/2026): o validador aceitava `http://`, e a
 * própria mensagem dele dizia "precisa começar com https://". Em produção a
 * chamada recusa `http:` (`assertSafeOutboundUrl`), então o fluxo ligava e
 * todo disparo caía em "Falhou" sem chamar nada. E `https://{{x}}/…` passava.
 */
import { describe, expect, it } from "vitest";

import { problemasDoGrafo } from "@/lib/chatbot/validar";
import { grafoSchema } from "@/lib/chatbot/passos";

function comWebhook(url: string) {
  return grafoSchema.parse({
    nodes: [
      { id: "ini", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
      { id: "w", type: "webhook", position: { x: 0, y: 100 }, data: { url, metodo: "POST" } },
    ],
    edges: [{ id: "e1", source: "ini", target: "w", sourceHandle: "proximo" }],
  });
}

const reclamaDoEndereco = (url: string) =>
  problemasDoGrafo(comWebhook(url)).some((p) => p.includes("precisa começar com https://"));

describe("validação do endereço do WebHook", () => {
  it.each(["http://api.exemplo.com/h", "https://{{servidor}}/h", "https://a{{x}}.com/h"])(
    "recusa %s",
    (url) => {
      expect(reclamaDoEndereco(url)).toBe(true);
    },
  );

  it.each([
    "https://api.exemplo.com/h",
    "https://api.exemplo.com/h/{{id}}",
    "https://api.exemplo.com",
  ])("aceita %s", (url) => {
    expect(reclamaDoEndereco(url)).toBe(false);
  });
});
