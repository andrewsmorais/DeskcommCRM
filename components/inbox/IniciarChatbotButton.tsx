"use client";
/**
 * "Iniciar chatbot" na conversa — o "Iniciar manualmente" da Umbler. Só
 * aparece quando a organização tem algum chatbot ligado com esse início, então
 * a barra de ações não ganha um botão morto em quem não usa.
 *
 * Chatbot "não listado" fica fora deste menu (continua no Fechar, no Agendar e
 * nas automações). Chatbot com "Perguntar ao atendente ao iniciar" abre uma
 * janela com as perguntas antes de começar; cada resposta vira variável.
 *
 * Só o ícone (como o de busca): a barra já estourou a largura útil em 1280px
 * uma vez, e um botão com texto a mais a empurraria para uma segunda fileira.
 */
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Robot } from "@/lib/ui/icons";
import { useChatbotsManuais, useIniciarChatbot } from "@/hooks/inbox/useChatbotManual";

type Fluxo = NonNullable<ReturnType<typeof useChatbotsManuais>["data"]>[number];

export function IniciarChatbotButton({ conversationId }: { conversationId: string }) {
  const t = useT();
  const { data: todos } = useChatbotsManuais();
  const iniciar = useIniciarChatbot(t("Chatbot iniciado nesta conversa."));
  const [perguntando, setPerguntando] = useState<Fluxo | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const fluxos = (todos ?? []).filter((f) => !f.nao_listado);
  if (fluxos.length === 0) return null;

  const escolher = (f: Fluxo) => {
    if ((f.perguntas_ao_iniciar ?? []).length > 0) {
      setRespostas({});
      setPerguntando(f);
      return;
    }
    iniciar.mutate({ conversation_id: conversationId, flow_id: f.id });
  };

  return (
    <>
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
            <DropdownMenuItem key={f.id} onClick={() => escolher(f)}>
              {f.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={!!perguntando} onOpenChange={(aberto) => !aberto && setPerguntando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{perguntando?.name}</DialogTitle>
            <DialogDescription>{t("Responda antes de iniciar o chatbot.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(perguntando?.perguntas_ao_iniciar ?? []).map((p) => (
              <div key={p.variavel} className="space-y-1.5">
                <Label htmlFor={`iniciar-${p.variavel}`}>{p.rotulo}</Label>
                <Input
                  id={`iniciar-${p.variavel}`}
                  value={respostas[p.variavel] ?? ""}
                  maxLength={500}
                  onChange={(e) => setRespostas((r) => ({ ...r, [p.variavel]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPerguntando(null)}>
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              data-testid="iniciar-com-respostas"
              disabled={iniciar.isPending}
              onClick={() => {
                if (!perguntando) return;
                iniciar.mutate({ conversation_id: conversationId, flow_id: perguntando.id, variaveis: respostas });
                setPerguntando(null);
              }}
            >
              {t("Iniciar chatbot")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
