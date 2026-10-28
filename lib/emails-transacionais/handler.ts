/**
 * Adapter fino do dispatcher do `event_log` para `aplicaEmailTransacional`
 * (`./aplicar.ts`) — a lógica é pura e testada; aqui só há a ligação com o
 * registry e com os clients de produção.
 *
 * Sai por rede de terceiro (Resend/SMTP), então é registrado depois de quem só
 * escreve no banco. O `status` só vira `error` por defeito de programa (o
 * `catch`): estado de mundo — sem destinatário, sem e-mail configurado — é
 * `skipped`, e falha de envio é `retry`.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { emailDeSuporte, marcaDaSaida, whatsappDeSuporte } from "@/lib/branding/saida";
import { sendEmail } from "@/lib/email/roteador";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EMAIL_TRANSACIONAL_HANDLER_KEY,
  EVENTO_CONTA_CRIADA,
  EVENTO_PLANO_ALTERADO,
  EVENTO_REEMBOLSO_CONFIRMADO,
  aplicaEmailTransacional,
} from "@/lib/emails-transacionais/aplicar";
import { criarDbDosEmails } from "@/lib/emails-transacionais/db";

export const emailsTransacionaisHandler: EventHandler = {
  key: EMAIL_TRANSACIONAL_HANDLER_KEY,
  events: [EVENTO_CONTA_CRIADA, EVENTO_PLANO_ALTERADO, EVENTO_REEMBOLSO_CONFIRMADO],
  async handle(row): Promise<HandlerResult> {
    try {
      return await aplicaEmailTransacional(
        {
          db: criarDbDosEmails(createAdminClient()),
          enviar: async (a) => {
            const r = await sendEmail({
              to: a.to,
              subject: a.subject,
              html: a.html,
              text: a.text,
              fromName: a.fromName,
              tags: [{ name: "tipo", value: a.tipo }],
            });
            return r.ok ? { ok: true } : { ok: false, error: r.error ?? "send_failed" };
          },
          marca: (org) => marcaDaSaida(org),
          contato: async () => {
            const [email, whatsapp] = await Promise.all([emailDeSuporte(), whatsappDeSuporte()]);
            return { email, whatsapp };
          },
          urlDoApp: env.NEXT_PUBLIC_APP_URL,
          agora: () => new Date(),
        },
        row,
      );
    } catch (err) {
      logger.warn("[emails-transacionais] falha inesperada", {
        event_id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        consumer_key: EMAIL_TRANSACIONAL_HANDLER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
