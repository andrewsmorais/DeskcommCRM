/**
 * Quais horários livres o passo "Agendar horário" oferece — PURO.
 *
 * Cortar pela cabeça enviesa: 5 horários numa grade de 30 minutos são uma
 * manhã só, e o contato que só pode à tarde ou amanhã não vê opção. Como em
 * `crm_find_free_slots` (lib/mcp/tools/agendamento.ts), a escolha espalha: um
 * de cada dia por rodada, até o teto, e devolve em ordem de horário.
 */
import { rotuloLocal } from "@/lib/tempo/agora";

type Slot = { inicio: Date; fim: Date };

export function escolherOfertas(slots: readonly Slot[], fuso: string, teto: number): Slot[] {
  const porDia = new Map<string, Slot[]>();
  for (const s of slots) {
    // "segunda-feira 27/10" — o rótulo do dia no fuso da agenda.
    const dia = rotuloLocal(s.inicio, fuso).split(" às ")[0] ?? "";
    const lista = porDia.get(dia);
    if (lista) lista.push(s);
    else porDia.set(dia, [s]);
  }
  const escolhidos: Slot[] = [];
  for (let rodada = 0; escolhidos.length < teto; rodada += 1) {
    let achou = false;
    for (const lista of porDia.values()) {
      const s = lista[rodada];
      if (s === undefined) continue;
      achou = true;
      escolhidos.push(s);
      if (escolhidos.length >= teto) break;
    }
    if (!achou) break;
  }
  return escolhidos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
