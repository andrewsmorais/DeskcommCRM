"use client";

/**
 * O aviso do plano sem "Follow-up automático": aqui o follow-up é feito para o
 * card "Iniciar follow-up" do chatbot. A regra mora em
 * `lib/billing/followup-pelo-chatbot.ts`; este texto só a descreve.
 */
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";

export function AvisoFollowupPeloChatbot() {
  const t = useT();
  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
      data-testid="aviso-followup-pelo-chatbot"
    >
      <p className="font-medium">{t("No seu plano, o follow-up funciona pelo chatbot.")}</p>
      <p className="mt-1">
        {t(
          "Monte aqui com início manual, mensagem de texto ou modelo, espera de tempo fixo e tarefa, publique e escolha no card “Iniciar follow-up” do chatbot. Mensagem escrita pela IA, condições, gatilhos automáticos e o agente de IA pondo contatos em follow-up são do plano Impulso.",
        )}{" "}
        <Link href="/app/settings/billing" className="underline underline-offset-2">
          {t("Ver planos")}
        </Link>
      </p>
    </div>
  );
}
