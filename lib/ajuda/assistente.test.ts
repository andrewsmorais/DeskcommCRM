import { describe, expect, it, vi } from "vitest";
import {
  FalhaDoAssistente,
  MODELO_DA_AJUDA,
  pedidoDeAjudaSchema,
  perguntarAoAssistente,
} from "@/lib/ajuda/assistente";

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status });
}

const base = {
  chave: "sk-ant-teste-0000000000000000",
  sistemaFixo: "FIXO",
  sistemaDoCliente: "CLIENTE",
};

describe("assistente de ajuda", () => {
  it("manda o fixo com cache, o do cliente sem, e tira o marcador de escalar", async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      resposta(200, {
        content: [{ type: "text", text: "Fale com a equipe.\n[ESCALAR]" }],
        usage: { input_tokens: 10, cache_read_input_tokens: 900, output_tokens: 20 },
      }),
    );
    const r = await perguntarAoAssistente({
      ...base,
      fetch: f as unknown as typeof fetch,
      pedido: pedidoDeAjudaSchema.parse({
        mensagem: "Fui cobrado duas vezes",
        historico: [{ papel: "assistant", texto: "Olá!" }],
        tela: "/app/settings/billing",
      }),
    });
    expect(r).toEqual({
      texto: "Fale com a equipe.",
      escalou: true,
      uso: { entrada: 10, cache: 900, saida: 20 },
    });
    const corpo = JSON.parse(String(f.mock.calls[0]![1]!.body));
    expect(corpo.model).toBe(MODELO_DA_AJUDA);
    expect(corpo.system[0]).toMatchObject({ text: "FIXO", cache_control: { type: "ephemeral" } });
    expect(corpo.system[1].cache_control).toBeUndefined();
    expect(corpo.messages[0].role).toBe("user");
    expect(JSON.stringify(corpo.messages)).toContain("/app/settings/billing");
  });

  it("chave recusada não tenta de novo", async () => {
    const f = vi.fn(async () => resposta(401, { error: {} }));
    await expect(
      perguntarAoAssistente({
        ...base,
        fetch: f as unknown as typeof fetch,
        pedido: pedidoDeAjudaSchema.parse({ mensagem: "oi" }),
      }),
    ).rejects.toBeInstanceOf(FalhaDoAssistente);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("instabilidade tenta duas vezes", async () => {
    const f = vi.fn(async () => resposta(529, {}));
    await expect(
      perguntarAoAssistente({
        ...base,
        fetch: f as unknown as typeof fetch,
        pedido: pedidoDeAjudaSchema.parse({ mensagem: "oi" }),
      }),
    ).rejects.toMatchObject({ motivo: "indisponivel" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("o esquema recusa campo extra, imagem de tipo errado e tela estranha", () => {
    expect(pedidoDeAjudaSchema.safeParse({ mensagem: "oi", organization_id: "x" }).success).toBe(
      false,
    );
    expect(
      pedidoDeAjudaSchema.safeParse({ mensagem: "oi", imagem: { tipo: "image/gif", base64: "AA" } })
        .success,
    ).toBe(false);
    expect(
      pedidoDeAjudaSchema.safeParse({ mensagem: "oi", tela: "javascript:alert(1)" }).success,
    ).toBe(false);
  });
});
