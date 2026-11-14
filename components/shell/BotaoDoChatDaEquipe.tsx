"use client";
/**
 * A porta do Chat da equipe: um botão no topo, ao lado do sino, com o número de
 * mensagens não lidas. Fica no topo (e não no menu lateral) porque o menu já
 * está no teto da dobra — e porque recado da equipe tem de ser visto de
 * qualquer tela.
 */
import Link from "next/link";

import { useAoVivoDoChatDaEquipe, useConversasDaEquipe } from "@/hooks/equipe/useChatDaEquipe";
import { useT } from "@/hooks/i18n/useT";
import { ChatsCircle } from "@/lib/ui/icons";

export function BotaoDoChatDaEquipe() {
  const t = useT();
  useAoVivoDoChatDaEquipe();
  const { data } = useConversasDaEquipe();
  const n = data?.nao_lidas ?? 0;
  const rotulo =
    n === 0
      ? t("Chat da equipe")
      : n === 1
        ? `${t("Chat da equipe")} — ${t("1 mensagem não lida da equipe")}`
        : `${t("Chat da equipe")} — ${n} ${t("mensagens não lidas da equipe")}`;
  return (
    <Link
      href="/app/chat-da-equipe"
      aria-label={rotulo}
      title={rotulo}
      data-testid="botao-do-chat-da-equipe"
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9 lg:w-9"
    >
      <ChatsCircle size={18} aria-hidden />
      {n > 0 ? (
        <span
          data-testid="contador-do-chat-da-equipe"
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
        >
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}
