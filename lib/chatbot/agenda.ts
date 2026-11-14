/**
 * "Aguardar até" por EXPRESSÃO DE AGENDA — os cinco campos do cron clássico:
 *
 *     minuto  hora  dia-do-mês  mês  dia-da-semana
 *     0       9     *           *    1-5        → dias úteis às 09:00
 *     30      8     1,15        *    *          → dias 1 e 15 às 08:30
 *     0       10    *           12   6          → sábados de dezembro às 10:00
 *
 * É o "CRON" do bloco equivalente da Umbler. Aceita `*`, número, lista (`1,15`),
 * faixa (`1-5`) e passo (`*​/15`, `8-18/2`). Dia da semana: 0 ou 7 = domingo.
 * Quando dia-do-mês E dia-da-semana estão restritos, vale UM OU OUTRO (a regra
 * do cron). O relógio é o da EMPRESA (fuso dela), não o do servidor.
 *
 * PURO e limitado: a expressão tem no máximo 80 letras, cada campo vira um
 * conjunto pequeno de números, e a busca do próximo instante anda no máximo
 * 366 dias × os horários do dia. Nada aqui é regex escrita pelo usuário.
 */
const LIMITES = [
  { nome: "minuto", de: 0, ate: 59 },
  { nome: "hora", de: 0, ate: 23 },
  { nome: "dia do mês", de: 1, ate: 31 },
  { nome: "mês", de: 1, ate: 12 },
  { nome: "dia da semana", de: 0, ate: 7 },
] as const;

export const AGENDA_MAX = 80;

export interface Agenda {
  minutos: number[];
  horas: number[];
  diasDoMes: number[];
  meses: number[];
  diasDaSemana: number[];
  /** false = o campo era `*`. */
  restringeDiaDoMes: boolean;
  restringeDiaDaSemana: boolean;
}

function campo(texto: string, i: number): number[] | string {
  const { nome, de, ate } = LIMITES[i]!;
  const valores = new Set<number>();
  for (const parte of texto.split(",")) {
    const m = /^(\*|\d{1,2}(?:-\d{1,2})?)(?:\/(\d{1,2}))?$/.exec(parte);
    if (!m) return `O campo "${nome}" não foi entendido: "${parte}".`;
    const passo = m[2] ? Number(m[2]) : 1;
    if (passo < 1) return `No campo "${nome}", o passo começa em 1.`;
    let a: number = de;
    let b: number = ate;
    if (m[1] !== "*") {
      const [x, y] = m[1]!.split("-").map(Number);
      a = x!;
      b = y ?? (m[2] ? ate : x!);
    }
    if (a < de || b > ate || a > b) return `No campo "${nome}", use de ${de} a ${ate}.`;
    for (let v = a; v <= b; v += passo) valores.add(v);
  }
  return [...valores].sort((x, y) => x - y);
}

/** Lê a expressão. Devolve a agenda, ou a frase do que está errado. */
export function lerAgenda(expressao: string): Agenda | string {
  const texto = expressao.trim();
  if (!texto) return "Escreva a agenda.";
  if (texto.length > AGENDA_MAX) return `A agenda pode ter no máximo ${AGENDA_MAX} letras.`;
  const campos = texto.split(/\s+/);
  if (campos.length !== 5)
    return "A agenda tem cinco partes separadas por espaço: minuto, hora, dia do mês, mês e dia da semana.";
  const lidos: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const r = campo(campos[i]!, i);
    if (typeof r === "string") return r;
    lidos.push(r);
  }
  const agenda: Agenda = {
    minutos: lidos[0]!,
    horas: lidos[1]!,
    diasDoMes: lidos[2]!,
    meses: lidos[3]!,
    // 7 também é domingo.
    diasDaSemana: [...new Set(lidos[4]!.map((d) => d % 7))].sort((x, y) => x - y),
    restringeDiaDoMes: campos[2] !== "*",
    restringeDiaDaSemana: campos[4] !== "*",
  };
  // "31 de fevereiro" nunca chega: melhor avisar ao salvar do que esperar um ano à toa.
  const maiorDia = (mes: number) => (mes === 2 ? 29 : [4, 6, 9, 11].includes(mes) ? 30 : 31);
  if (agenda.restringeDiaDoMes && !agenda.restringeDiaDaSemana) {
    const existe = agenda.meses.some((mes) => agenda.diasDoMes.some((d) => d <= maiorDia(mes)));
    if (!existe) return "Essa combinação de dia e mês não existe no calendário.";
  }
  return agenda;
}

/** O dia (no calendário da empresa) entra na agenda? */
export function diaNaAgenda(a: Agenda, mes: number, dia: number, diaDaSemana: number): boolean {
  if (!a.meses.includes(mes)) return false;
  const peloMes = a.diasDoMes.includes(dia);
  const pelaSemana = a.diasDaSemana.includes(diaDaSemana);
  if (a.restringeDiaDoMes && a.restringeDiaDaSemana) return peloMes || pelaSemana;
  if (a.restringeDiaDoMes) return peloMes;
  if (a.restringeDiaDaSemana) return pelaSemana;
  return true;
}

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const lista = (itens: string[]) =>
  itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** A agenda dita em português, para quem não lê cron. "" quando a expressão é inválida. */
export function descreverAgenda(expressao: string): string {
  const a = lerAgenda(expressao);
  if (typeof a === "string") return "";
  const horarios = a.horas.length * a.minutos.length;
  const quando =
    horarios <= 4
      ? `às ${lista(a.horas.flatMap((h) => a.minutos.map((m) => `${doisDigitos(h)}:${doisDigitos(m)}`)))}`
      : a.minutos.length === 1
        ? `no minuto ${doisDigitos(a.minutos[0]!)} das horas ${lista(a.horas.map(String))}`
        : `em ${horarios} horários do dia`;
  const partes: string[] = [];
  if (a.restringeDiaDoMes) partes.push(`${a.diasDoMes.length === 1 ? "no dia" : "nos dias"} ${lista(a.diasDoMes.map(String))}`);
  if (a.restringeDiaDaSemana) {
    const uteis = a.diasDaSemana.join() === "1,2,3,4,5";
    partes.push(uteis ? "de segunda a sexta" : `${a.diasDaSemana.some((d) => d === 0 || d === 6) && a.diasDaSemana.length === 1 ? "todo" : "toda"} ${lista(a.diasDaSemana.map((d) => SEMANA[d]!))}`);
  }
  const dias = partes.length === 0 ? "Todo dia" : partes.join(" ou ");
  const meses = a.meses.length === 12 ? "" : `, em ${lista(a.meses.map((m) => MESES[m]!))}`;
  const frase = `${dias}${meses}, ${quando}`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}
