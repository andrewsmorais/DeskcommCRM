/**
 * MENSAGENS AGENDADAS (migration 0511) — a régua, sem banco: serve à tela, às
 * rotas e ao worker.
 *
 * Como o "Agendar mensagens" da Umbler Talk: dentro da conversa o atendente
 * deixa uma mensagem, uma nota interna ou um chatbot para sair num dia e hora.
 * No horário, o worker envia pelo MESMO caminho da tela, em nome de quem agendou
 * (`lib/agendadas/executar.ts`).
 */
import { z } from "zod";

export const TIPOS_DE_AGENDADA = ["mensagem", "nota", "chatbot"] as const;
export type TipoDeAgendada = (typeof TIPOS_DE_AGENDADA)[number];

export const STATUS_DE_AGENDADA = ["agendada", "processando", "enviada", "falhou", "cancelada"] as const;
export type StatusDeAgendada = (typeof STATUS_DE_AGENDADA)[number];

/** O evento-comando que o worker drena no horário (`lib/agent-engine/edge/crm/drain.ts`). */
export const EVENTO_DA_AGENDADA = "mensagem_agendada.envio_requested";

/** Mesmo teto de texto do envio pela tela. */
export const TEXTO_MAXIMO = 4096;
/** Agendar para "agora" é enviar: o mínimo dá tempo de desfazer. */
export const ANTECEDENCIA_MINIMA_MS = 60_000;
/** Um ano: agendamento esquecido não sai anos depois. */
export const ANTECEDENCIA_MAXIMA_MS = 366 * 24 * 60 * 60 * 1000;

/** O corpo de POST (criar) — o mesmo do PATCH (editar), que só vale para `agendada`. */
export const agendadaSchema = z
  .object({
    tipo: z.enum(TIPOS_DE_AGENDADA),
    texto: z.string().trim().max(TEXTO_MAXIMO).optional(),
    chatbot_flow_id: z.string().uuid().optional(),
    enviar_em: z.string().datetime({ offset: true }),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "chatbot" && !v.chatbot_flow_id)
      ctx.addIssue({ code: "custom", path: ["chatbot_flow_id"], message: "Escolha o chatbot." });
    if (v.tipo !== "chatbot" && !v.texto)
      ctx.addIssue({ code: "custom", path: ["texto"], message: "Escreva a mensagem." });
  });
export type AgendadaInput = z.infer<typeof agendadaSchema>;

/** Por que o horário não serve, ou null. `agora` entra de fora para o teste. */
export function problemaDoHorario(enviarEm: string, agora: Date): string | null {
  const t = new Date(enviarEm).getTime();
  if (Number.isNaN(t)) return "Data ou hora inválida.";
  if (t - agora.getTime() < ANTECEDENCIA_MINIMA_MS)
    return "Escolha um horário pelo menos 1 minuto à frente.";
  if (t - agora.getTime() > ANTECEDENCIA_MAXIMA_MS) return "Escolha um horário dentro de um ano.";
  return null;
}

/** Linha como a tela e as rotas a enxergam. */
export type MensagemAgendada = {
  id: string;
  conversation_id: string;
  tipo: TipoDeAgendada;
  texto: string | null;
  chatbot_flow_id: string | null;
  enviar_em: string;
  status: StatusDeAgendada;
  erro: string | null;
  criado_por: string;
  enviado_em: string | null;
  created_at: string;
};

export const COLUNAS_DA_AGENDADA =
  "id, conversation_id, tipo, texto, chatbot_flow_id, enviar_em, status, erro, criado_por, enviado_em, created_at";
