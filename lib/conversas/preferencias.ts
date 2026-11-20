/**
 * PREFERÊNCIAS DE CONVERSA DA EMPRESA — o "Configurações › Conversas" da Umbler
 * Talk, e a assinatura de cada atendente.
 *
 * Mora em `organizations.settings.conversas` (jsonb, sem coluna nova): duas
 * decisões que a empresa toma uma vez e que a tela de conversa obedece.
 *
 *   assinatura — o nome do atendente vai antes do texto que ele envia:
 *     - `atendente_escolhe` (padrão): cada um liga ou desliga no campo de
 *       mensagem ("Assinar");
 *     - `sempre`: toda mensagem de atendente sai assinada;
 *     - `nunca`: nenhuma sai, e a chave some do campo.
 *
 *   finalizar — o que a janela Fechar oferece:
 *     - `atendente_escolhe` (padrão): só encerrar, despedida antes ou chatbot;
 *     - `so_finalizar`: só encerra;
 *     - `mensagem`: sempre manda uma despedida antes de encerrar;
 *     - `chatbot`: sempre aciona um chatbot de encerramento.
 *     Com `mensagem_padrao` e `chatbot_padrao` sugeridos (a mensagem pessoal do
 *     perfil do atendente vale mais que a da empresa, como na Umbler).
 *
 * Funções puras: o servidor e a tela usam a MESMA régua, senão a tela
 * ofereceria o que a rota recusa.
 */
import { z } from "zod";

export const COMPORTAMENTOS_DA_ASSINATURA = ["atendente_escolhe", "sempre", "nunca"] as const;
export type ComportamentoDaAssinatura = (typeof COMPORTAMENTOS_DA_ASSINATURA)[number];

export const COMPORTAMENTOS_DO_FINALIZAR = ["atendente_escolhe", "so_finalizar", "mensagem", "chatbot"] as const;
export type ComportamentoDoFinalizar = (typeof COMPORTAMENTOS_DO_FINALIZAR)[number];

/** Tamanho máximo da assinatura (o mesmo limite da Umbler). */
export const ASSINATURA_MAX = 75;
/** Tamanho máximo de uma mensagem de WhatsApp aceita pelo envio. */
export const MENSAGEM_MAX = 4096;

/** O que acontece depois que a reatribuição tira o atendente da conversa. */
export const ACOES_DA_REATRIBUICAO = ["liberar", "chatbot"] as const;
export type AcaoDaReatribuicao = (typeof ACOES_DA_REATRIBUICAO)[number];

export const preferenciasDeConversaSchema = z.object({
  assinatura: z.enum(COMPORTAMENTOS_DA_ASSINATURA).default("atendente_escolhe"),
  finalizar: z
    .object({
      comportamento: z.enum(COMPORTAMENTOS_DO_FINALIZAR).default("atendente_escolhe"),
      mensagem_padrao: z.string().trim().max(MENSAGEM_MAX).nullable().default(null),
      chatbot_padrao: z.string().uuid().nullable().default(null),
    })
    .default({ comportamento: "atendente_escolhe", mensagem_padrao: null, chatbot_padrao: null }),
  /**
   * Reatribuição automática (Umbler): quando a regra do atendente o tira da
   * conversa, ela fica disponível para outro (`liberar`, padrão) ou um chatbot
   * de início manual começa (`chatbot`).
   */
  reatribuicao: z
    .object({
      acao: z.enum(ACOES_DA_REATRIBUICAO).default("liberar"),
      chatbot_id: z.string().uuid().nullable().default(null),
    })
    .default({ acao: "liberar", chatbot_id: null }),
  /**
   * "Ocultar administradores da lista de quem está visualizando a conversa"
   * (Umbler): o administrador vê a conversa sem aparecer para a equipe.
   */
  ocultar_administradores_vendo: z.boolean().default(false),
});
export type PreferenciasDeConversa = z.infer<typeof preferenciasDeConversaSchema>;

export const PREFERENCIAS_PADRAO: PreferenciasDeConversa = preferenciasDeConversaSchema.parse({});

/**
 * Lê `organizations.settings.conversas`. Valor velho, torto ou ausente vira o
 * padrão — uma configuração quebrada no jsonb não pode derrubar o envio.
 */
export function lerPreferenciasDeConversa(settings: unknown): PreferenciasDeConversa {
  const bruto = (settings as { conversas?: unknown } | null)?.conversas;
  const r = preferenciasDeConversaSchema.safeParse(bruto ?? {});
  if (!r.success) return PREFERENCIAS_PADRAO;
  const p = r.data;
  // Texto vazio é "sem sugestão", não uma despedida em branco.
  return { ...p, finalizar: { ...p.finalizar, mensagem_padrao: p.finalizar.mensagem_padrao || null } };
}

/** A mensagem sai assinada? `pediu` é a chave "Assinar" do campo de mensagem. */
export function deveAssinar(comportamento: ComportamentoDaAssinatura, pediu: boolean | undefined): boolean {
  if (comportamento === "sempre") return true;
  if (comportamento === "nunca") return false;
  return pediu === true;
}

/**
 * O nome que assina: a assinatura do perfil; vazia, o nome do perfil. Sem os
 * dois, ninguém assina — uma assinatura em branco seria "*:*" no WhatsApp.
 */
export function nomeQueAssina(meta: Record<string, unknown> | null | undefined): string | null {
  const limpar = (v: unknown) =>
    typeof v === "string" ? v.replace(/[*_~`\n\r]+/g, " ").replace(/\s+/g, " ").trim() : "";
  const assinatura = limpar(meta?.assinatura).slice(0, ASSINATURA_MAX);
  if (assinatura) return assinatura;
  const nome = limpar(meta?.full_name) || limpar(meta?.name);
  return nome ? nome.slice(0, ASSINATURA_MAX) : null;
}

/**
 * O texto como o contato o recebe: o nome em negrito do WhatsApp, numa linha
 * própria, e a mensagem embaixo.
 */
export function assinarTexto(nome: string, texto: string): string {
  return `*${nome}:*\n${texto}`;
}

/**
 * Assina, ou explica por que não dá. Devolve `null` quando a assinatura faria
 * a mensagem passar do limite do WhatsApp: cortar o texto do atendente em
 * silêncio seria pior que recusar.
 */
export function textoAssinado(nome: string | null, texto: string): string | null {
  if (!nome) return texto;
  const assinado = assinarTexto(nome, texto);
  return assinado.length > MENSAGEM_MAX ? null : assinado;
}

/** Que saídas a janela Fechar oferece, segundo a empresa. */
export function saidasDoFinalizar(
  comportamento: ComportamentoDoFinalizar,
): ReadonlyArray<"nenhum" | "mensagem" | "chatbot"> {
  switch (comportamento) {
    case "so_finalizar":
      return ["nenhum"];
    case "mensagem":
      return ["mensagem"];
    case "chatbot":
      return ["chatbot"];
    default:
      return ["nenhum", "mensagem", "chatbot"];
  }
}

/**
 * A despedida sugerida: a do perfil do atendente vale mais que a da empresa
 * ("Se definida, tem precedência sobre a mensagem da organização").
 */
export function despedidaSugerida(pessoal: string | null | undefined, daEmpresa: string | null): string {
  const p = typeof pessoal === "string" ? pessoal.trim() : "";
  return p || daEmpresa || "";
}
