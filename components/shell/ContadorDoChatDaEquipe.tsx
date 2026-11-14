"use client";

import { useAoVivoDoChatDaEquipe, useConversasDaEquipe } from "@/hooks/equipe/useChatDaEquipe";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Mensagens não lidas do chat interno da equipe — o número ao lado de "Chat da
 * equipe" no menu. Fica vivo pela assinatura Realtime; zero não desenha nada.
 */
export function ContadorDoChatDaEquipe({ compacto }: { compacto: boolean }) {
  const t = useT();
  useAoVivoDoChatDaEquipe();
  const { data } = useConversasDaEquipe();
  const n = data?.nao_lidas ?? 0;
  if (!n) return null;
  const rotulo = n === 1 ? t("1 mensagem não lida da equipe") : `${n} ${t("mensagens não lidas da equipe")}`;
  return (
    <span
      data-testid="contador-do-chat-da-equipe"
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground tabular-nums",
        compacto ? "absolute top-1 right-1 h-2 w-2" : "ml-auto px-1.5 py-0.5",
      )}
    >
      {compacto ? null : n > 99 ? "99+" : n}
    </span>
  );
}
