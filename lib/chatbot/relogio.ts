/**
 * Quando um fluxo parado em "Aguardar intervalo" / "Aguardar até" volta a
 * andar — PURO, sem banco. O executor grava o instante na sessão e agenda a
 * retomada no `event_log` (`chatbot.retomada_requested`), que o worker drena.
 */
import { ehFeriado } from "./feriados";
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

/** O "Aguardar até" numa data aceita até um ano à frente: é intenção escrita, não esquecimento. */
export const ESPERA_MAXIMA_DA_DATA_MS = 366 * 24 * 60 * 60 * 1000;

function diaValido(ano: number, mes: number, dia: number): { ano: number; mes: number; dia: number } | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
    ? { ano, mes, dia }
    : null;
}

/**
 * O dia de um valor guardado: "20/11/2026" (Pedir para digitar, formato data),
 * "2026-11-20" ou um instante ISO (o `{{horario_inicio}}` do Agendar horário,
 * lido no fuso da empresa). Outra coisa → null.
 */
export function diaDoValor(
  valor: string,
  fuso: string,
): { ano: number; mes: number; dia: number } | null {
  const v = valor.trim();
  let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return diaValido(Number(m[3]), Number(m[2]), Number(m[1]));
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return diaValido(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    const p = partesLocais(d, fuso);
    return { ano: p.ano, mes: p.mes, dia: p.dia };
  }
  return null;
}

/**
 * O instante do "Aguardar até" numa data: o dia (fixo ou da resposta), mais o
 * deslocamento em dias de calendário, na `hora` do fuso da empresa. null =
 * sem data válida — vazia, fora do formato, já passou, ou mais de um ano à
 * frente — e o motor segue por "Sem data válida".
 */
export function instanteDaData(
  c: ConfigDe<"aguardar_ate">,
  dados: Record<string, string>,
  agora: Date,
  fuso: string,
): Date | null {
  const bruto = c.fonte_da_data === "fixa" ? c.data : c.variavel ? (dados[c.variavel] ?? "") : "";
  const dia = diaDoValor(bruto, fuso);
  if (!dia) return null;
  const [h = 9, m = 0] = c.hora.split(":").map(Number);
  const alvoDoDia = new Date(Date.UTC(dia.ano, dia.mes - 1, dia.dia + c.deslocamento_dias));
  const alvo = instanteLocal(
    alvoDoDia.getUTCFullYear(),
    alvoDoDia.getUTCMonth() + 1,
    alvoDoDia.getUTCDate(),
    h,
    m,
    fuso,
  );
  const falta = alvo.getTime() - agora.getTime();
  if (falta <= ESPERA_MINIMA_MS || falta > ESPERA_MAXIMA_DA_DATA_MS) return null;
  return alvo;
}

/** A próxima vez (estritamente depois de `agora`) que for `hora` num dos `dias`, no fuso da empresa. */
export function proximoHorario(c: ConfigDe<"aguardar_ate">, agora: Date, fuso: string): Date {
  const [h = 9, m = 0] = c.hora.split(":").map(Number);
  // 14 dias: com feriados pulados, a semana inteira pode não bastar (Natal
  // numa sexta + fim de semana + Ano-Novo).
  for (let k = 0; k <= 14; k++) {
    const dia = partesLocais(new Date(agora.getTime() + k * 86_400_000), fuso);
    if (!c.dias.includes(dia.diaDaSemana)) continue;
    if (
      c.pular_feriados &&
      ehFeriado(
        `${dia.ano}-${String(dia.mes).padStart(2, "0")}-${String(dia.dia).padStart(2, "0")}`,
        { feriados_nacionais: true, pontos_facultativos: false, datas: [] },
      )
    )
      continue;
    const candidato = instanteLocal(dia.ano, dia.mes, dia.dia, h, m, fuso);
    if (candidato.getTime() > agora.getTime() + ESPERA_MINIMA_MS) return candidato;
  }
  // `dias` vazio não passa no schema; isto só cobre fuso quebrado.
  return new Date(agora.getTime() + 86_400_000);
}
