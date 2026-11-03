/**
 * "Transferir p/ atendente" — quem recebe a conversa nos modos automáticos. PURO.
 *
 * Os modos são os da Umbler Talk (artigo "Como criar um chatbot com
 * fluxograma"): atendente específico, rodízio, quem tem menos conversas em
 * aberto e quem atendeu o contato antes. Os dois do meio escolhem entre os
 * candidatos que `loadEligibleAttendants` já filtrou (disponível ∧ no horário
 * ∧ com folga) — o MESMO cálculo da Distribuição de atendimento, para o
 * chatbot nunca entregar a conversa a quem está fora do ar.
 *
 * O rodízio é o da Distribuição (`selectRoundRobin`): recebe primeiro quem foi
 * atribuído há mais tempo, ou nunca. "Menos conversas" desempata pelo rodízio,
 * para dois atendentes com a mesma carga não receberem sempre na mesma ordem.
 */
import { selectRoundRobin, type RoutingCandidate } from "@/lib/routing/decide";

import type { ModoDeAtendente } from "./passos";

/** Candidatos restritos à lista do passo; lista vazia = todos os candidatos. */
export function soDaLista(candidatos: RoutingCandidate[], lista: string[]): RoutingCandidate[] {
  if (lista.length === 0) return candidatos;
  const permitidos = new Set(lista);
  return candidatos.filter((c) => permitidos.has(c.userId));
}

/** O atendente escolhido entre os candidatos, ou null se não houver ninguém. */
export function escolherAtendente(
  modo: Extract<ModoDeAtendente, "rodizio" | "menos_conversas">,
  candidatos: RoutingCandidate[],
  lista: string[],
): string | null {
  const elegiveis = soDaLista(candidatos, lista);
  if (elegiveis.length === 0) return null;
  if (modo === "rodizio") return selectRoundRobin(elegiveis);
  const menor = Math.min(...elegiveis.map((c) => c.currentLoad));
  return selectRoundRobin(elegiveis.filter((c) => c.currentLoad === menor));
}

/**
 * Nota que a equipe lê quando o modo não achou ninguém e a conversa foi para a
 * fila. Texto do produto (não do operador), igual às outras notas do chatbot.
 */
export function notaSemAtendente(modo: ModoDeAtendente): string {
  switch (modo) {
    case "especifico":
      return "O atendente escolhido no chatbot não faz mais parte da equipe: a conversa foi para a fila de atendimento.";
    case "rodizio":
    case "menos_conversas":
      return "Ninguém da equipe estava disponível para receber a conversa do chatbot agora: ela ficou na fila de atendimento.";
    case "anterior":
      return "O chatbot procurou quem atendeu este contato antes e não achou ninguém da equipe: a conversa ficou na fila de atendimento.";
  }
}
