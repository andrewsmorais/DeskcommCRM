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
 *   - o mesmo plano de novo: renovação, reativação, o vaivém de estados.
 *
 * Os três planos têm os mesmos e-mails (contratado, melhorado, reduzido) desde
 * que o Escala passou a ser contratado pelo checkout (19/11/2026). A única
 * exceção é o Escala com números COMBINADOS pelo dono da plataforma (proposta
 * acima do pacote base): ENTRAR nele é `escala_ativo`, que fala da proposta e
 * não mostra valor nem próxima cobrança.
 */
import { PLANOS_COMERCIAIS, planoComercial, type PlanoComercial } from "@/lib/billing/catalogo";
import type { PlanoComEmail } from "@/lib/emails-transacionais/modelos";

export type DecisaoDePlano =
  | { enviar: true; tipo: "contratado" }
  | { enviar: true; tipo: "escala_ativo" }
  | { enviar: true; tipo: "melhorado"; anterior: PlanoComEmail }
  | { enviar: true; tipo: "reduzido"; anterior: PlanoComEmail }
  | {
      enviar: false;
      motivo: "plano_desconhecido" | "mesmo_plano";
      /** O plano que o histórico deve passar a registrar, quando há um. */
      registrar: PlanoComercial | null;
    };

export function decidirEmailDePlano(args: {
  plano: string | null;
  /** O último plano dito à pessoa por e-mail (ou registrado como base). */
  ultimoPlano: string | null;
  /** Escala com números combinados pelo dono (proposta acima do pacote). */
  escalaComProposta?: boolean;
}): DecisaoDePlano {
  const plano = args.plano ? planoComercial(args.plano) : null;
  if (!plano) return { enviar: false, motivo: "plano_desconhecido", registrar: null };

  const ultimo = args.ultimoPlano ? planoComercial(args.ultimoPlano) : null;
  if (ultimo === plano) return { enviar: false, motivo: "mesmo_plano", registrar: null };
  if (plano === "escala" && args.escalaComProposta) return { enviar: true, tipo: "escala_ativo" };
  if (ultimo === null) return { enviar: true, tipo: "contratado" };

  return PLANOS_COMERCIAIS[plano].ordem > PLANOS_COMERCIAIS[ultimo].ordem
    ? { enviar: true, tipo: "melhorado", anterior: ultimo }
    : { enviar: true, tipo: "reduzido", anterior: ultimo };
}
