/**
 * "Automações avançadas" (Impulso em diante) — o que numa regra de automação
 * custa mais ou é recurso novo, e por isso não está no Essencial:
 *
 *   - gatilhos de DESFECHO do negócio: `lead.won` e `lead.lost`;
 *   - ação que escreve com IA (`send_ai_message`): cada disparo é custo de IA;
 *   - ação que manda e-mail (`send_email`) ou aviso à equipe (`notify_team`);
 *   - mensagem de WhatsApp com mídia (`send_whatsapp_message` com `media_url`).
 *
 * Regra que não usa nada disso (mensagem de texto, etiqueta, dono, tarefa,
 * webhook de saída, fluxo) continua em todos os planos, como sempre esteve.
 *
 * Puro de propósito: a MESMA função decide na rota que grava a regra e no
 * motor que a executa — uma regra salva antes de a organização descer de plano
 * para de rodar sem ser apagada.
 */

export const GATILHOS_AVANCADOS: ReadonlySet<string> = new Set(["lead.won", "lead.lost"]);

export const ACOES_AVANCADAS: ReadonlySet<string> = new Set([
  "send_ai_message",
  "send_email",
  "notify_team",
]);

type Acao = { type?: unknown; config?: unknown };

function acaoAvancada(a: Acao): boolean {
  const tipo = typeof a?.type === "string" ? a.type : "";
  if (ACOES_AVANCADAS.has(tipo)) return true;
  if (tipo === "send_whatsapp_message") {
    const cfg = a.config as Record<string, unknown> | null | undefined;
    const midia = cfg && typeof cfg === "object" ? cfg.media_url : null;
    return typeof midia === "string" && midia.trim() !== "";
  }
  return false;
}

export function regraUsaAutomacaoAvancada(regra: {
  trigger_event?: unknown;
  actions?: unknown;
}): boolean {
  if (typeof regra.trigger_event === "string" && GATILHOS_AVANCADOS.has(regra.trigger_event)) {
    return true;
  }
  return Array.isArray(regra.actions) && regra.actions.some((a) => acaoAvancada(a as Acao));
}
