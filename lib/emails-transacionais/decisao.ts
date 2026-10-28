/**
 * Qual e-mail uma mudança de assinatura merece — e nenhum, quando não merece.
 *
 * O banco avisa que a assinatura ENTROU em trialing/active ou TROCOU de plano
 * (`plano.alterado`, migration 0493). Ele não sabe distinguir "primeira
 * contratação" de "subiu de plano": a linha de `subscriptions` é reusada na
 * recontratação, e a reserva do checkout passa por `suspended` com o plano novo
 * já gravado. Quem sabe é o histórico do que JÁ foi dito à pessoa — o último
 * plano de um e-mail enviado (`transactional_email_log`). É ele que a decisão
 * compara.
 *
 * Sem e-mail, por ordem:
 *   - plano desconhecido (sem `plan_type`, ou fora do catálogo);
 *   - Escala, de ou para: é ativado à mão, com números combinados, e ainda não
 *     tem texto. O plano entra no histórico mesmo assim (`baseline`), para a
 *     comparação seguinte não partir de um passado errado;
 *   - o mesmo plano de novo: renovação, reativação, o vaivém de estados.
 */
import { PLANOS_COMERCIAIS, planoComercial, type PlanoComercial } from "@/lib/billing/catalogo";
import type { PlanoComEmail } from "@/lib/emails-transacionais/modelos";

export type DecisaoDePlano =
  | { enviar: true; tipo: "contratado" }
  | { enviar: true; tipo: "melhorado"; anterior: PlanoComEmail }
  | { enviar: true; tipo: "reduzido"; anterior: PlanoComEmail }
  | {
      enviar: false;
      motivo: "plano_desconhecido" | "escala_sem_email" | "mesmo_plano";
      /** O plano que o histórico deve passar a registrar, quando há um. */
      registrar: PlanoComercial | null;
    };

function comEmail(plano: PlanoComercial): plano is PlanoComEmail {
  return plano !== "escala";
}

export function decidirEmailDePlano(args: {
  plano: string | null;
  /** O último plano dito à pessoa por e-mail (ou registrado como base). */
  ultimoPlano: string | null;
}): DecisaoDePlano {
  const plano = args.plano ? planoComercial(args.plano) : null;
  if (!plano) return { enviar: false, motivo: "plano_desconhecido", registrar: null };

  const ultimo = args.ultimoPlano ? planoComercial(args.ultimoPlano) : null;

  if (!comEmail(plano) || (ultimo !== null && !comEmail(ultimo))) {
    return { enviar: false, motivo: "escala_sem_email", registrar: plano };
  }
  if (ultimo === null) return { enviar: true, tipo: "contratado" };
  if (ultimo === plano) return { enviar: false, motivo: "mesmo_plano", registrar: null };

  return PLANOS_COMERCIAIS[plano].ordem > PLANOS_COMERCIAIS[ultimo].ordem
    ? { enviar: true, tipo: "melhorado", anterior: ultimo }
    : { enviar: true, tipo: "reduzido", anterior: ultimo };
}
