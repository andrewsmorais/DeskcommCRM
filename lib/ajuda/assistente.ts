/**
 * A chamada ao Claude do assistente de ajuda — mesmo desenho do suporte do
 * Pombo: o servidor monta o prompt, a chave nunca sai dele, o cliente manda só
 * a conversa (e um print opcional).
 *
 * `fetch` direto na Messages API, e não o gateway dos agentes: este chat usa a
 * chave PRÓPRIA (`AJUDA_ANTHROPIC_API_KEY`), separada da dos agentes, para o
 * custo do suporte aparecer à parte na Anthropic.
 *
 * O prompt fixo (manual inteiro, ~40 mil tokens) vai com `cache_control`: da
 * segunda mensagem em diante a Anthropic cobra só uma fração dele.
 */
import { z } from "zod";

import { MARCA_DE_ESCALAR } from "@/lib/ajuda/prompt";

export const MODELO_DA_AJUDA = "claude-haiku-5-5";
const URL_DA_API = "https://api.anthropic.com/v1/messages";
const VERSAO_DA_API = "2023-06-01";
const MAX_TOKENS = 1200;

export const MAX_CARACTERES = 2000;
export const MAX_HISTORICO = 12;
export const MAX_BYTES_DA_IMAGEM = 3 * 1024 * 1024;
const TIPOS_DE_IMAGEM = ["image/jpeg", "image/png", "image/webp"] as const;

export const pedidoDeAjudaSchema = z
  .object({
    mensagem: z.string().trim().min(1).max(MAX_CARACTERES),
    historico: z
      .array(
        z.object({
          papel: z.enum(["user", "assistant"]),
          texto: z.string().max(MAX_CARACTERES * 3),
        }),
      )
      .max(MAX_HISTORICO)
      .default([]),
    imagem: z
      .object({
        tipo: z.enum(TIPOS_DE_IMAGEM),
        base64: z
          .string()
          .max(Math.ceil((MAX_BYTES_DA_IMAGEM * 4) / 3))
          .regex(/^[A-Za-z0-9+/=]+$/),
      })
      .optional(),
    /** Rota em que a pessoa estava ao abrir a ajuda — só contexto. */
    tela: z
      .string()
      .max(200)
      .regex(/^\/[A-Za-z0-9/_\-[\]]*$/)
      .optional(),
  })
  .strict();

export type PedidoDeAjuda = z.infer<typeof pedidoDeAjudaSchema>;

export type RespostaDaAjuda = {
  texto: string;
  escalou: boolean;
  uso: { entrada: number; cache: number; saida: number };
};

export class FalhaDoAssistente extends Error {
  constructor(
    readonly motivo: "sem_resposta" | "recusado" | "indisponivel",
    detalhe: string,
  ) {
    super(detalhe);
  }
}

type Fetch = typeof fetch;

export async function perguntarAoAssistente(args: {
  chave: string;
  sistemaFixo: string;
  sistemaDoCliente: string;
  pedido: PedidoDeAjuda;
  fetch?: Fetch;
}): Promise<RespostaDaAjuda> {
  const f = args.fetch ?? fetch;
  const { pedido } = args;

  const mensagens: Array<{ role: "user" | "assistant"; content: unknown }> = [];
  for (const turno of pedido.historico) {
    const texto = turno.texto.trim();
    if (texto) mensagens.push({ role: turno.papel, content: texto });
  }
  // A Messages API exige começar por `user`; um histórico que começa pela
  // saudação do assistente é cortado até a primeira fala da pessoa.
  while (mensagens[0]?.role === "assistant") mensagens.shift();

  const blocos: unknown[] = [];
  if (pedido.imagem) {
    blocos.push({
      type: "image",
      source: { type: "base64", media_type: pedido.imagem.tipo, data: pedido.imagem.base64 },
    });
  }
  const onde = pedido.tela ? `\n\n(Tela aberta quando a pessoa pediu ajuda: ${pedido.tela})` : "";
  blocos.push({ type: "text", text: pedido.mensagem + onde });
  mensagens.push({ role: "user", content: blocos });

  const corpo = JSON.stringify({
    model: MODELO_DA_AJUDA,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: args.sistemaFixo, cache_control: { type: "ephemeral" } },
      { type: "text", text: args.sistemaDoCliente },
    ],
    messages: mensagens,
  });

  let ultimo = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const res = await f(URL_DA_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": args.chave,
        "anthropic-version": VERSAO_DA_API,
      },
      body: corpo,
      signal: AbortSignal.timeout(45_000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      const bruto = (json.content ?? [])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!bruto) throw new FalhaDoAssistente("sem_resposta", "resposta vazia");
      const escalou = bruto.includes(MARCA_DE_ESCALAR);
      const texto = bruto.split(MARCA_DE_ESCALAR).join("").trim();
      return {
        texto,
        escalou,
        uso: {
          entrada: (json.usage?.input_tokens ?? 0) + (json.usage?.cache_creation_input_tokens ?? 0),
          cache: json.usage?.cache_read_input_tokens ?? 0,
          saida: json.usage?.output_tokens ?? 0,
        },
      };
    }
    ultimo = `${res.status}`;
    // 401/403/400: chave ou pedido errado — repetir não muda nada.
    if (res.status < 500 && res.status !== 429) {
      throw new FalhaDoAssistente("recusado", ultimo);
    }
  }
  throw new FalhaDoAssistente("indisponivel", ultimo);
}
