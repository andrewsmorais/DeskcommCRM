"use client";
/**
 * Olho no topo da conversa: oculta a conversa da caixa de entrada (sem fechar
 * o atendimento) ou a mostra de novo — o mesmo que o card "Visibilidade da
 * conversa" do chatbot. Só ícone, como o cadeado ao lado: a barra de ações do
 * cabeçalho não tem largura para mais um botão com texto.
 */
import { Eye, EyeSlash } from "@/lib/ui/icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { useVisibilidadeDaConversa } from "@/hooks/inbox/useVisibilidadeDaConversa";
import type { Visibilidade } from "@/lib/inbox/visibilidade";

export function VisibilidadeButton({
  conversationId,
  visibilidade,
}: {
  conversationId: string;
  visibilidade: Visibilidade;
}) {
  const t = useT();
  const mudar = useVisibilidadeDaConversa();
  const oculta = visibilidade !== "visivel";
  const dica = oculta
    ? visibilidade === "oculta_ate_mensagem"
      ? t("Conversa oculta até a próxima mensagem do contato. Clique para mostrar ou mudar.")
      : t("Conversa oculta: está no filtro Ocultas. Clique para mostrar ou mudar.")
    : t("Ocultar conversa: ela sai da caixa de entrada sem ser fechada.");
  const escolher = (v: Visibilidade) =>
    mudar.mutate({ conversation_id: conversationId, visibilidade: v });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={oculta ? "default" : "outline"}
          className="w-11 px-0 lg:w-8"
          disabled={mudar.isPending}
          aria-label={dica}
          title={dica}
          data-testid="conversa-visibilidade"
        >
          {oculta ? <EyeSlash size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={visibilidade === "visivel"}
          onSelect={() => escolher("visivel")}
          data-testid="visibilidade-visivel"
        >
          {t("Mostrar na caixa de entrada")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={visibilidade === "oculta"}
          onSelect={() => escolher("oculta")}
          data-testid="visibilidade-oculta"
        >
          {t("Ocultar")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={visibilidade === "oculta_ate_mensagem"}
          onSelect={() => escolher("oculta_ate_mensagem")}
          data-testid="visibilidade-oculta-ate-mensagem"
        >
          {t("Ocultar até a próxima mensagem do contato")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
