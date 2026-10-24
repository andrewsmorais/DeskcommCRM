"use client";
/**
 * "Iniciar chatbot" na conversa — o "Iniciar manualmente" da Umbler. Só
 * aparece quando a organização tem algum chatbot ligado com esse início, então
 * a barra de ações não ganha um botão morto em quem não usa.
 *
 * Só o ícone (como o de busca): a barra já estourou a largura útil em 1280px
 * uma vez, e um botão com texto a mais a empurraria para uma segunda fileira.
 */
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Robot } from "@/lib/ui/icons";
import { useChatbotsManuais, useIniciarChatbot } from "@/hooks/inbox/useChatbotManual";

export function IniciarChatbotButton({ conversationId }: { conversationId: string }) {
  const t = useT();
  const { data: fluxos } = useChatbotsManuais();
  const iniciar = useIniciarChatbot(t("Chatbot iniciado nesta conversa."));
  if (!fluxos || fluxos.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-11 px-0 lg:w-8"
          disabled={iniciar.isPending}
          aria-label={t("Iniciar chatbot")}
          title={t("Iniciar chatbot")}
          data-testid="iniciar-chatbot"
        >
          <Robot size={16} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("Iniciar chatbot nesta conversa")}</DropdownMenuLabel>
        {fluxos.map((f) => (
          <DropdownMenuItem
            key={f.id}
            onClick={() => iniciar.mutate({ conversation_id: conversationId, flow_id: f.id })}
          >
            {f.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
