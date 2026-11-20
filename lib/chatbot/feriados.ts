/**
 * Feriados do passo "Horários": o dia todo conta como "Fora do horário". PURO.
 *
 * Nacionais (Lei 662/1949, Lei 6.802/1980 e Lei 14.759/2023): 1º de janeiro,
 * Tiradentes (21/04), Dia do Trabalho (01/05), Independência (07/09), Nossa
 * Senhora Aparecida (12/10), Finados (02/11), Proclamação da República
 * (15/11), Consciência Negra (20/11), Natal (25/12) e a Sexta-feira Santa
 * (Paixão de Cristo, móvel). Carnaval (segunda e terça) e Corpus Christi não
 * são feriado nacional — são ponto facultativo — e por isso ficam numa opção
 * à parte. Estadual e municipal a empresa escreve na lista dela.
 */

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];

function somarDias(d: Date, dias: number): string {
  return new Date(d.getTime() + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Os feriados do ano como "AAAA-MM-DD". */
export function feriadosDoAno(ano: number, facultativos: boolean): string[] {
  const p = pascoa(ano);
  const lista = [...FIXOS.map((md) => `${ano}-${md}`), somarDias(p, -2)];
  // Carnaval (segunda e terça) e Corpus Christi (60 dias depois da Páscoa).
  if (facultativos) lista.push(somarDias(p, -48), somarDias(p, -47), somarDias(p, 60));
  return lista.sort();
}

/**
 * A data local ("AAAA-MM-DD") é feriado? `datas` são as da empresa:
 * "25/12" vale todo ano; "15/03/2026" só naquele dia.
 */
export function ehFeriado(
  dataLocal: string,
  c: { feriados_nacionais: boolean; pontos_facultativos: boolean; datas: string[] },
): boolean {
  const [ano, mes, dia] = dataLocal.split("-");
  if (!ano || !mes || !dia) return false;
  if (c.feriados_nacionais && feriadosDoAno(Number(ano), c.pontos_facultativos).includes(dataLocal))
    return true;
  return c.datas.some((d) => d === `${dia}/${mes}` || d === `${dia}/${mes}/${ano}`);
}

/** "25/12, 15/03/2026" → datas válidas (o resto é descartado). */
export function lerDatasDeFeriado(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((d) => d.trim())
    .filter((d) => /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])(\/\d{4})?$/.test(d))
    .slice(0, 60);
}
