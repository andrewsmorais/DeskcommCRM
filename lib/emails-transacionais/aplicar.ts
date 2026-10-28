/**
 * O miolo dos e-mails de relacionamento: dado um evento do `event_log`, decide,
 * reserva, monta e envia. Puro de provedor — banco, transporte e marca entram
 * por `deps`, e é por isso que `aplicar.test.ts` roda sem rede e sem banco.
 *
 * ── Três regras que valem mais que o texto ──────────────────────────────────
 *
 * 1. **O evento é um aviso, não uma prova.** `emit_event` é alcançável por
 *    qualquer usuário autenticado (`grant ... to authenticated`) e não confere
 *    a organização do chamador. Por isso o payload nunca decide NADA que mude
 *    para quem o e-mail vai ou o que ele afirma: o plano vem da assinatura
 *    lida no banco; o reembolso só sai se a assinatura está de fato
 *    `suspended`; e o destinatário tem de ser membro vivo DAQUELA organização.
 *    Um evento forjado, na pior hipótese, não produz e-mail nenhum.
 *
 * 2. **Uma vez só.** A reserva é uma linha em `transactional_email_log` com
 *    `unique (organization_id, dedupe_key)`, criada ANTES do envio. Reentrega
 *    do mesmo evento, dois drenos em paralelo ou uma queda entre enviar e
 *    gravar caem no `23505` e viram `skipped`. Se o envio FALHA, a reserva é
 *    devolvida e o evento volta para a fila: envio em dobro é pior que atraso.
 *
 * 3. **E-mail nunca trava o que o gerou.** Cadastro e pagamento já terminaram
 *    quando este código roda — ele consome a fila, não está no caminho deles.
 *    Instalação sem e-mail configurado devolve `skipped` e não reprocessa.
 */
import type { EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import type { MarcaDeSaida } from "@/lib/branding/saida";
import { limitesEfetivos } from "@/lib/billing/catalogo";
import { decidirEmailDePlano } from "@/lib/emails-transacionais/decisao";
import {
  montarBoasVindas,
  montarEscalaAtivo,
  montarPlanoContratado,
  montarPlanoMelhorado,
  montarPlanoReduzido,
  montarReembolso,
  type CicloDeCobranca,
  type EmailMontado,
  type FormaDePagamento,
} from "@/lib/emails-transacionais/modelos";

export const EMAIL_TRANSACIONAL_HANDLER_KEY = "emails-transacionais.v1";

export const EVENTO_CONTA_CRIADA = "conta.criada";
export const EVENTO_PLANO_ALTERADO = "plano.alterado";
export const EVENTO_REEMBOLSO_CONFIRMADO = "reembolso.confirmado";

export type TipoDeEmail =
  | "boas_vindas"
  | "plano_contratado"
  | "plano_melhorado"
  | "plano_reduzido"
  | "reembolso"
  | "escala_ativo"
  /** Não é e-mail: registra o plano de uma mudança que não gera texto. */
  | "baseline";

export type Destinatario = { userId: string; email: string; nome: string | null };

export type AssinaturaLida = {
  plan_type: string | null;
  status: string | null;
  billing_cycle: string | null;
  contracted_amount_cents: number | null;
  expires_at: string | null;
  current_period_end: string | null;
  limites_personalizados?: unknown;
};

export interface DbDosEmails {
  /** Membro vivo da organização, ou o dono dela quando `userId` não vem. */
  destinatario(organizationId: string, userId: string | null): Promise<Destinatario | null>;
  assinatura(organizationId: string): Promise<AssinaturaLida | null>;
  /** O último plano dito à pessoa, ou registrado como base. */
  ultimoPlano(organizationId: string): Promise<string | null>;
  reservar(entrada: {
    organizationId: string;
    tipo: TipoDeEmail;
    dedupeKey: string;
    planType: string | null;
    userId: string | null;
  }): Promise<"reservado" | "ja_registrado">;
  devolver(organizationId: string, dedupeKey: string): Promise<void>;
}

export type ResultadoDoEnvio = { ok: true } | { ok: false; error: string };

export interface DepsDosEmails {
  db: DbDosEmails;
  enviar(args: {
    to: string;
    subject: string;
    html: string;
    text: string;
    fromName: string;
    tipo: TipoDeEmail;
  }): Promise<ResultadoDoEnvio>;
  marca(organizationId: string): Promise<MarcaDeSaida>;
  /** Contatos de suporte da instalação; vazio = não aparece no e-mail. */
  contato(): Promise<{ email: string; whatsapp: string }>;
  urlDoApp: string;
  agora(): Date;
}

const RETENTATIVA_MS = 5 * 60_000;

function resultado(
  status: HandlerResult["status"],
  detail: string,
  deps?: DepsDosEmails,
): HandlerResult {
  return {
    consumer_key: EMAIL_TRANSACIONAL_HANDLER_KEY,
    status,
    detail,
    ...(status === "retry" && deps
      ? { retry_at: new Date(deps.agora().getTime() + RETENTATIVA_MS).toISOString() }
      : {}),
  };
}

function primeiroNome(nome: string | null): string | null {
  const n = nome?.trim().split(/\s+/)[0];
  return n ? n : null;
}

function ciclo(c: string | null): CicloDeCobranca | null {
  return c === "monthly" || c === "quarterly" || c === "yearly" ? c : null;
}

function forma(f: unknown): FormaDePagamento | null {
  return f === "PIX" || f === "CREDIT_CARD" || f === "BOLETO" ? f : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function aplicaEmailTransacional(
  deps: DepsDosEmails,
  row: EventRow,
): Promise<HandlerResult> {
  const org = row.organization_id;

  switch (row.event_type) {
    case EVENTO_CONTA_CRIADA: {
      const quem = await deps.db.destinatario(org, texto(row.payload?.user_id));
      if (!quem) return resultado("skipped", "sem_destinatario");
      const assinatura = await deps.db.assinatura(org);
      const marca = await deps.marca(org);
      return entregar(deps, {
        org,
        tipo: "boas_vindas",
        dedupeKey: "boas_vindas",
        planType: null,
        quem,
        marca,
        montar: () =>
          montarBoasVindas({
            marca,
            nome: primeiroNome(quem.nome),
            emTeste: assinatura?.status === "trialing",
            urlDoApp: deps.urlDoApp,
          }),
      });
    }

    case EVENTO_PLANO_ALTERADO: {
      // O plano e o estado vêm do BANCO, nunca do payload (regra 1).
      const assinatura = await deps.db.assinatura(org);
      if (!assinatura || (assinatura.status !== "trialing" && assinatura.status !== "active")) {
        return resultado("skipped", "assinatura_nao_ativa");
      }
      const decisao = decidirEmailDePlano({
        plano: assinatura.plan_type,
        ultimoPlano: await deps.db.ultimoPlano(org),
      });
      const dedupeKey = `plano:${row.id}`;

      if (!decisao.enviar) {
        if (decisao.registrar) {
          await deps.db.reservar({
            organizationId: org,
            tipo: "baseline",
            dedupeKey,
            planType: decisao.registrar,
            userId: null,
          });
        }
        return resultado("skipped", decisao.motivo);
      }

      const quem = await deps.db.destinatario(org, null);
      if (!quem) return resultado("skipped", "sem_destinatario");
      const marca = await deps.marca(org);

      if (decisao.tipo === "escala_ativo") {
        // Sem valor nem próxima cobrança: o preço do Escala é combinado
        // (decisão do dono, 28/10/2026). Os números são os da proposta.
        const contato = await deps.contato();
        return entregar(deps, {
          org,
          tipo: "escala_ativo",
          dedupeKey,
          planType: "escala",
          quem,
          marca,
          montar: () =>
            montarEscalaAtivo({
              marca,
              nome: primeiroNome(quem.nome),
              limites: limitesEfetivos("escala", assinatura.limites_personalizados ?? null),
              urlDoApp: deps.urlDoApp,
              contato,
            }),
        });
      }

      const plano = assinatura.plan_type as "essencial" | "impulso";
      const base = {
        marca,
        nome: primeiroNome(quem.nome),
        plano,
        urlDoApp: deps.urlDoApp,
        resumo: {
          ciclo: ciclo(assinatura.billing_cycle),
          valorEmCentavos: assinatura.contracted_amount_cents,
          proximaCobranca: dataOuNula(assinatura.expires_at ?? assinatura.current_period_end),
        },
      };
      const tipo: TipoDeEmail =
        decisao.tipo === "contratado"
          ? "plano_contratado"
          : decisao.tipo === "melhorado"
            ? "plano_melhorado"
            : "plano_reduzido";
      return entregar(deps, {
        org,
        tipo,
        dedupeKey,
        planType: plano,
        quem,
        marca,
        montar: () =>
          decisao.tipo === "contratado"
            ? montarPlanoContratado(base)
            : decisao.tipo === "melhorado"
              ? montarPlanoMelhorado({ ...base, anterior: decisao.anterior })
              : montarPlanoReduzido({ ...base, anterior: decisao.anterior }),
      });
    }

    case EVENTO_REEMBOLSO_CONFIRMADO: {
      // Só há reembolso se a assinatura foi mesmo suspensa pelo estorno (regra 1).
      const assinatura = await deps.db.assinatura(org);
      if (assinatura?.status !== "suspended")
        return resultado("skipped", "sem_estorno_na_assinatura");
      const quem = await deps.db.destinatario(org, null);
      if (!quem) return resultado("skipped", "sem_destinatario");
      const marca = await deps.marca(org);
      const valor = Number(row.payload?.value);
      return entregar(deps, {
        org,
        tipo: "reembolso",
        dedupeKey: `reembolso:${texto(row.payload?.payment_id) ?? row.id}`,
        planType: null,
        quem,
        marca,
        montar: () =>
          montarReembolso({
            marca,
            nome: primeiroNome(quem.nome),
            valorEmCentavos: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) : null,
            forma: forma(row.payload?.billing_type),
          }),
      });
    }

    default:
      return resultado("skipped", "evento_fora_do_escopo");
  }
}

function dataOuNula(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function entregar(
  deps: DepsDosEmails,
  a: {
    org: string;
    tipo: TipoDeEmail;
    dedupeKey: string;
    planType: string | null;
    quem: Destinatario;
    marca: MarcaDeSaida;
    montar: () => EmailMontado;
  },
): Promise<HandlerResult> {
  const reserva = await deps.db.reservar({
    organizationId: a.org,
    tipo: a.tipo,
    dedupeKey: a.dedupeKey,
    planType: a.planType,
    userId: a.quem.userId,
  });
  if (reserva === "ja_registrado") return resultado("skipped", "ja_enviado");

  const email = a.montar();
  const envio = await deps.enviar({
    to: a.quem.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromName: a.marca.nome,
    tipo: a.tipo,
  });

  if (envio.ok) return resultado("ok", a.tipo);

  // Devolve a reserva em qualquer falha: sem isso o evento seguinte acharia o
  // e-mail "já enviado" e a pessoa nunca o receberia.
  await deps.db.devolver(a.org, a.dedupeKey);
  // Instalação sem e-mail configurado não é falha transitória: reprocessar a
  // cada rodada só encheria o dreno. O evento é consumido e o motivo fica claro.
  if (envio.error === "not_configured") return resultado("skipped", "email_nao_configurado");
  return resultado("retry", `envio_falhou:${envio.error}`, deps);
}
