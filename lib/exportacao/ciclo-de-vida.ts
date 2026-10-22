/**
 * O CICLO DE VIDA DOS DADOS DE UMA CONTA QUE PERDEU O ACESSO — regra PURA.
 *
 *   fim do acesso ─────────────────────────────► +30 dias
 *        │ encerramento │        d7        │ dia │
 *        └──────────────┴──────────────────┴─────┘
 *
 * Os Termos prometem 30 dias para exportar os dados depois que o acesso termina.
 * Este módulo decide QUAL aviso a pessoa deve receber hoje, e nenhum outro.
 *
 * ─── Janelas exclusivas, e é por isso que não há "recuperação" ──────────────
 *
 * Cada aviso tem uma janela própria e as janelas não se sobrepõem. Se o cron
 * ficou parado uma semana, quando voltar só existe UM aviso devido — o da fase
 * em que estamos — e não três e-mails de uma vez. Quem já passou da fase de um
 * aviso nunca o recebe atrasado, e quem está fora de qualquer janela (acesso
 * ativo, ou muito depois do prazo) não recebe nada.
 *
 * O aviso do "dia" tem folga de 2 dias e acaba aí: depois disso o que o e-mail
 * diria ("hoje é o último dia") seria falso, e quem decide o que acontece com os
 * dados nessa data não é este arquivo.
 *
 * ─── Quem NÃO entra ─────────────────────────────────────────────────────────
 *
 * `active` nunca entra, nem com data vencida: uma renovação cuja confirmação
 * atrasou não é conta encerrada, e avisar "seus dados serão apagados" por causa
 * de um webhook atrasado é o pior erro possível desta peça.
 */
export const DIAS_PARA_EXPORTAR = 30;
export const DIAS_DO_AVISO_ANTECIPADO = 7;
export const FOLGA_DO_AVISO_FINAL_DIAS = 2;

const DIA_MS = 86_400_000;

export type Aviso = "encerramento" | "d7" | "dia";

/** Situações em que o acesso pode ter terminado. `active` fica de fora de propósito. */
const SITUACOES_QUE_ENCERRAM: readonly string[] = ["canceled", "suspended", "past_due", "trialing"];

export interface DatasDaAssinatura {
  readonly status: string;
  readonly current_period_end: string | null;
  readonly expires_at: string | null;
  readonly canceled_at: string | null;
}

function data(valor: string | null): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Quando o acesso terminou (ou termina): fim do período pago, senão o fim do teste, senão o cancelamento. */
export function fimDoAcesso(a: DatasDaAssinatura): Date | null {
  return data(a.current_period_end) ?? data(a.expires_at) ?? data(a.canceled_at);
}

export function acessoEncerrado(a: DatasDaAssinatura, agora: Date): boolean {
  if (!SITUACOES_QUE_ENCERRAM.includes(a.status)) return false;
  const fim = fimDoAcesso(a);
  return fim !== null && fim.getTime() <= agora.getTime();
}

/** O instante a partir do qual os dados podem ser excluídos. */
export function exclusaoEm(fim: Date): Date {
  return new Date(fim.getTime() + DIAS_PARA_EXPORTAR * DIA_MS);
}

/** A fase em que a conta está agora, ou `null` fora de qualquer janela de aviso. */
export function faseDoAviso(fim: Date, agora: Date): Aviso | null {
  const t = agora.getTime();
  const exclusao = exclusaoEm(fim).getTime();
  if (t < fim.getTime()) return null;
  if (t < exclusao - DIAS_DO_AVISO_ANTECIPADO * DIA_MS) return "encerramento";
  if (t < exclusao) return "d7";
  if (t < exclusao + FOLGA_DO_AVISO_FINAL_DIAS * DIA_MS) return "dia";
  return null;
}

/** O aviso devido AGORA — a fase atual, a menos que já tenha sido enviado. */
export function avisoDevido(
  fim: Date,
  agora: Date,
  jaEnviados: Partial<Record<Aviso, string>>,
): Aviso | null {
  const fase = faseDoAviso(fim, agora);
  if (fase === null) return null;
  return jaEnviados[fase] ? null : fase;
}
