"use client";
/**
 * Cadeado no topo da conversa: torna a conversa privada (só o responsável e os
 * gestores a veem) ou a libera. Só ícone, do tamanho do botão de busca — a
 * barra de ações do cabeçalho já não tem largura para mais um botão com texto
 * em 1280px (ver o comentário no topo de ConversationHeader).
 *
 * Aparece para o responsável e para gerente/admin; a rota confere de novo.
 */
import { Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { usePrivacidadeDaConversa } from "@/hooks/inbox/usePrivacidadeDaConversa";

export function PrivacidadeButton({
  conversationId,
  privada,
  temResponsavel,
}: {
  conversationId: string;
  privada: boolean;
  temResponsavel: boolean;
}) {
  const t = useT();
  const mudar = usePrivacidadeDaConversa();
  // Privar sem responsável esconderia a conversa de todos os atendentes.
  const bloqueado = !privada && !temResponsavel;
  const dica = privada
    ? t("Conversa privada: só o responsável e os gestores a veem. Clique para liberar.")
    : bloqueado
      ? t("Atribua a conversa a um atendente antes de torná-la privada.")
      : t("Tornar privada: só o responsável e os gestores vão ver esta conversa.");
  return (
    <Button
      size="sm"
      variant={privada ? "default" : "outline"}
      className="w-11 px-0 lg:w-8"
      disabled={mudar.isPending || bloqueado}
      aria-label={dica}
      title={dica}
      aria-pressed={privada}
      data-testid="conversa-privacidade"
      onClick={() => mudar.mutate({ conversation_id: conversationId, is_private: !privada })}
    >
      {privada ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
    </Button>
  );
}
