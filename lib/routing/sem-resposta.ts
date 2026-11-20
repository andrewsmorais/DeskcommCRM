/**
 * CONVERSA SEM RESPOSTA VOLTA PARA A FILA — a regra pura, sem banco.
 *
 * Quando a organização liga o prazo (`settings.routing.unanswered_return_after_minutes`),
 * a conversa que está com um atendente, tem uma mensagem do cliente esperando e
 * NENHUMA resposta de pessoa depois dela, passado o prazo, é devolvida à fila:
 * fica sem dono e o roteamento escolhe de novo.
 *
 * O prazo conta do mais RECENTE entre a mensagem do cliente e o momento em que o
 * atendente assumiu — quem acabou de receber a conversa ganha o prazo inteiro
 * (senão uma conversa com cliente esperando há horas voltaria no primeiro tick,
 * antes de a pessoa ter chance de ver).
 *
 * Fica de fora: grupo de WhatsApp, conversa encerrada, conversa sem dono e
 * conversa cuja última fala é da equipe (cliente não está esperando).
 */

import { PRAZO_MAX_MINUTOS, PRAZO_MIN_MINUTOS } from "@/lib/escalacao/devolucao-automatica";

export interface ConversaComDono {
  id: string;
  organization_id: string;
  status: string | null;
  is_group?: boolean | null;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

/** Lê o prazo de `organizations.settings`. Ausente, nulo ou fora da faixa = nunca. */
export function lerPrazoSemRespostaMinutos(settings: unknown): number | null {
  const routing = (settings as { routing?: unknown } | null)?.routing;
  const valor = (routing as { unanswered_return_after_minutes?: unknown } | null)
    ?.unanswered_return_after_minutes;
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  if (valor < PRAZO_MIN_MINUTOS || valor > PRAZO_MAX_MINUTOS) return null;
  return Math.floor(valor);
}

const STATUS_QUE_VOLTAM = new Set(["open", "pending", "claimed"]);

function ms(valor: string | null): number | null {
  if (!valor) return null;
  const t = Date.parse(valor);
  return Number.isFinite(t) ? t : null;
}

/** O cliente está esperando resposta de uma pessoa? */
export function clienteEstaEsperando(c: ConversaComDono): boolean {
  const entrada = ms(c.last_inbound_at);
  if (entrada === null) return false;
  const saida = ms(c.last_outbound_at);
  return saida === null || saida < entrada;
}

export function selecionarSemResposta(
  conversas: ConversaComDono[],
  prazoPorOrg: Map<string, number>,
  agoraMs: number,
): Array<{ conversa: ConversaComDono; minutos: number }> {
  const out: Array<{ conversa: ConversaComDono; minutos: number }> = [];
  for (const conversa of conversas) {
    const minutos = prazoPorOrg.get(conversa.organization_id);
    if (!minutos) continue;
    if (conversa.is_group) continue;
    if (!conversa.assigned_to_user_id) continue;
    if (!conversa.status || !STATUS_QUE_VOLTAM.has(conversa.status)) continue;
    if (!clienteEstaEsperando(conversa)) continue;
    const desde = Math.max(ms(conversa.last_inbound_at) ?? 0, ms(conversa.assigned_at) ?? 0);
    if (agoraMs - desde >= minutos * 60_000) out.push({ conversa, minutos });
  }
  return out;
}
