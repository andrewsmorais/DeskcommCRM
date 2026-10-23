/**
 * Quando um fluxo parado em "Aguardar intervalo" / "Aguardar até" volta a
 * andar — PURO, sem banco. O executor grava o instante na sessão e agenda a
 * retomada no `event_log` (`chatbot.retomada_requested`), que o worker drena.
 */
import type { ConfigDe } from "./passos";

/** Teto de qualquer espera: um fluxo esquecido não acorda meses depois. */
export const ESPERA_MAXIMA_MS = 30 * 24 * 60 * 60 * 1000;
/** Piso: o worker drena em segundos, e menos que isto vira "agora". */
export const ESPERA_MINIMA_MS = 3_000;

const MS_POR_UNIDADE = {
  segundos: 1_000,
  minutos: 60_000,
  horas: 3_600_000,
  dias: 86_400_000,
} as const;

export function fimDoIntervalo(c: ConfigDe<"aguardar_intervalo">, agora: Date): Date {
  const ms = Math.min(
    Math.max(c.quantidade * MS_POR_UNIDADE[c.unidade], ESPERA_MINIMA_MS),
    ESPERA_MAXIMA_MS,
  );
  return new Date(agora.getTime() + ms);
}

type PartesLocais = { ano: number; mes: number; dia: number; hora: number; minuto: number; diaDaSemana: number };

function partesLocais(instante: Date, fuso: string): PartesLocais {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
  } catch {
    return partesLocais(instante, "America/Sao_Paulo");
  }
  const p = f.formatToParts(instante);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  return {
    ano: Number(v("year")),
    mes: Number(v("month")),
    dia: Number(v("day")),
    hora: Number(v("hour")),
    minuto: Number(v("minute")),
    diaDaSemana: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday")),
  };
}

/** O instante UTC em que o relógio de `fuso` marca aquela data e hora. */
function instanteLocal(ano: number, mes: number, dia: number, hora: number, minuto: number, fuso: string): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let palpite = alvo;
  // Duas voltas acertam o deslocamento do fuso, inclusive em virada de horário de verão.
  for (let i = 0; i < 2; i++) {
    const p = partesLocais(new Date(palpite), fuso);
    const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
    palpite += alvo - comoUtc;
  }
  return new Date(palpite);
}

/** A próxima vez (estritamente depois de `agora`) que for `hora` num dos `dias`, no fuso da empresa. */
export function proximoHorario(c: ConfigDe<"aguardar_ate">, agora: Date, fuso: string): Date {
  const [h = 9, m = 0] = c.hora.split(":").map(Number);
  for (let k = 0; k <= 7; k++) {
    const dia = partesLocais(new Date(agora.getTime() + k * 86_400_000), fuso);
    if (!c.dias.includes(dia.diaDaSemana)) continue;
    const candidato = instanteLocal(dia.ano, dia.mes, dia.dia, h, m, fuso);
    if (candidato.getTime() > agora.getTime() + ESPERA_MINIMA_MS) return candidato;
  }
  // `dias` vazio não passa no schema; isto só cobre fuso quebrado.
  return new Date(agora.getTime() + 86_400_000);
}
