/**
 * Troca de plano pelo próprio cliente — a regra, sem efeito nenhum.
 *
 * É a régua dos termos da Umbler Talk (a referência deste produto):
 *   - SUBIR (Essencial → Impulso): paga a diferença proporcional aos dias que
 *     faltam no período já pago, e o plano novo vale assim que o pagamento é
 *     confirmado. Diferença abaixo do mínimo de cobrança do Asaas (R$ 5) não
 *     vira cobrança: o plano muda na hora.
 *   - DESCER (Impulso → Essencial): o plano atual segue até o fim do período
 *     já pago, e o próximo período vem com o valor menor. Nada é devolvido.
 *   - No período de teste não há o que acertar: a troca vale na hora, nos dois
 *     sentidos, e a primeira cobrança já sai com o valor do plano novo.
 *   - O Escala é sob consulta e não passa por aqui; troca de ciclo também não.
 *
 * Os preços vêm da tabela `plans` (o mesmo catálogo que o checkout confere).
 */
import { PLANOS_COMERCIAIS, planoComercial, type PlanoComercial } from "@/lib/billing/catalogo";

export const PLANOS_TROCAVEIS = ["essencial", "impulso"] as const;
export type PlanoTrocavel = (typeof PLANOS_TROCAVEIS)[number];

/** Mínimo de cobrança do Asaas; abaixo disso a diferença não é cobrada. */
export const MINIMO_DA_COBRANCA_CENTS = 500;

export type Ciclo = "monthly" | "quarterly" | "yearly";

export type PrecosDoPlano = {
  price_monthly: number;
  price_quarterly: number | null;
  price_yearly: number | null;
};

const MESES: Record<Ciclo, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export function ehPlanoTrocavel(v: unknown): v is PlanoTrocavel {
  return typeof v === "string" && (PLANOS_TROCAVEIS as readonly string[]).includes(v);
}

export function cicloValido(v: unknown): v is Ciclo {
  return v === "monthly" || v === "quarterly" || v === "yearly";
}

/** O preço do ciclo inteiro, em centavos (a mesma conta do checkout). */
export function precoDoCiclo(p: PrecosDoPlano, ciclo: Ciclo): number {
  if (ciclo === "monthly") return p.price_monthly;
  if (ciclo === "quarterly") return p.price_quarterly ?? p.price_monthly * 3;
  return p.price_yearly ?? p.price_monthly * 12;
}

export type PedidoDeTroca = {
  planoAtual: string;
  planoNovo: string;
  ciclo: string;
  status: string;
  canceladaEm: string | null;
  inicioDoPeriodo: string | null;
  fimDoPeriodo: string | null;
  precoAtual: PrecosDoPlano;
  precoNovo: PrecosDoPlano;
  agora: Date;
};

export type DecisaoDeTroca =
  | {
      ok: true;
      tipo: "upgrade" | "downgrade";
      /** true = muda já (teste, ou diferença abaixo do mínimo). */
      aplicarAgora: boolean;
      /** Diferença a cobrar (só no upgrade que não aplica agora). */
      valorCents: number;
      /** Downgrade: quando passa a valer. */
      efetivaEm: string | null;
      /** O valor do ciclo que a recorrência passa a cobrar. */
      novoValorDoCicloCents: number;
      diasRestantes: number;
    }
  | { ok: false; motivo: MotivoDaRecusa };

export type MotivoDaRecusa =
  | "plano_invalido"
  | "mesmo_plano"
  | "sob_consulta"
  | "assinatura_cancelada"
  | "assinatura_inativa"
  | "periodo_desconhecido";

const DIA_MS = 24 * 60 * 60 * 1000;

export function decidirTroca(p: PedidoDeTroca): DecisaoDeTroca {
  const atual = planoComercial(p.planoAtual);
  if (!atual) return { ok: false, motivo: "plano_invalido" };
  if (atual === "escala") return { ok: false, motivo: "sob_consulta" };
  if (!ehPlanoTrocavel(p.planoNovo)) {
    return { ok: false, motivo: p.planoNovo === "escala" ? "sob_consulta" : "plano_invalido" };
  }
  if (p.planoNovo === atual) return { ok: false, motivo: "mesmo_plano" };
  if (!cicloValido(p.ciclo)) return { ok: false, motivo: "periodo_desconhecido" };
  if (p.status === "canceled" || p.canceladaEm)
    return { ok: false, motivo: "assinatura_cancelada" };

  const novoValorDoCicloCents = precoDoCiclo(p.precoNovo, p.ciclo);
  const tipo: "upgrade" | "downgrade" =
    PLANOS_COMERCIAIS[p.planoNovo as PlanoComercial].ordem >
    PLANOS_COMERCIAIS[atual as PlanoComercial].ordem
      ? "upgrade"
      : "downgrade";

  if (p.status === "trialing") {
    return {
      ok: true,
      tipo,
      aplicarAgora: true,
      valorCents: 0,
      efetivaEm: null,
      novoValorDoCicloCents,
      diasRestantes: 0,
    };
  }
  if (p.status !== "active") return { ok: false, motivo: "assinatura_inativa" };

  const fim = p.fimDoPeriodo ? Date.parse(p.fimDoPeriodo) : NaN;
  if (!Number.isFinite(fim) || fim <= p.agora.getTime()) {
    return { ok: false, motivo: "assinatura_inativa" };
  }
  const inicioLido = p.inicioDoPeriodo ? Date.parse(p.inicioDoPeriodo) : NaN;
  // Sem o começo gravado (assinatura antiga), o período tem o tamanho do ciclo.
  const inicio =
    Number.isFinite(inicioLido) && inicioLido < fim
      ? inicioLido
      : fim - MESES[p.ciclo] * 30 * DIA_MS;
  const restante = Math.min(1, Math.max(0, (fim - p.agora.getTime()) / (fim - inicio)));
  const diasRestantes = Math.ceil((fim - p.agora.getTime()) / DIA_MS);

  if (tipo === "downgrade") {
    return {
      ok: true,
      tipo,
      aplicarAgora: false,
      valorCents: 0,
      efetivaEm: new Date(fim).toISOString(),
      novoValorDoCicloCents,
      diasRestantes,
    };
  }

  const diferenca = Math.max(0, novoValorDoCicloCents - precoDoCiclo(p.precoAtual, p.ciclo));
  const valorCents = Math.round(diferenca * restante);
  const aplicarAgora = valorCents < MINIMO_DA_COBRANCA_CENTS;
  return {
    ok: true,
    tipo,
    aplicarAgora,
    valorCents: aplicarAgora ? 0 : valorCents,
    efetivaEm: null,
    novoValorDoCicloCents,
    diasRestantes,
  };
}

/**
 * O plano que vale AGORA: um downgrade agendado passa a valer no fim do período,
 * mesmo antes de o webhook da renovação consolidar a troca na assinatura.
 */
export function planoEmVigor(
  a: {
    plan_type: string | null;
    troca_tipo?: string | null;
    troca_plano?: string | null;
    troca_efetiva_em?: string | null;
  },
  agora: Date = new Date(),
): string | null {
  if (
    a.troca_tipo === "downgrade" &&
    ehPlanoTrocavel(a.troca_plano) &&
    a.troca_efetiva_em &&
    Date.parse(a.troca_efetiva_em) <= agora.getTime()
  ) {
    return a.troca_plano;
  }
  return a.plan_type;
}

export const MENSAGEM_DA_RECUSA: Record<MotivoDaRecusa, string> = {
  plano_invalido: "Escolha o Essencial ou o Impulso.",
  mesmo_plano: "Este já é o seu plano.",
  sob_consulta: "O Escala é contratado com a nossa equipe. Fale com a gente pelo suporte.",
  assinatura_cancelada:
    "A assinatura está cancelada. Contrate de novo pela página de planos para escolher o plano.",
  assinatura_inativa:
    "A assinatura não está em dia. Pague a fatura em aberto antes de trocar de plano.",
  periodo_desconhecido:
    "Não foi possível confirmar o período da sua assinatura. Fale com o suporte.",
};
