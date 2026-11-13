"use client";
/**
 * Encaminhar uma mensagem para até 5 conversas — como na Umbler Talk. Busca
 * pelo nome ou telefone do contato; a mensagem sai em nome de quem encaminhou.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { useEncaminhar } from "@/hooks/inbox/useMensagemFavoritaEncaminhar";
import { apiClient } from "@/lib/api/client";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";

type ConversaDaLista = {
  id: string;
  contacts: { display_name: string | null; name: string | null; phone_number: string | null } | null;
};

const MAX = 5;

export function EncaminharDialog(props: {
  mensagemId: string | null;
  conversaAtual: string;
  onClose: () => void;
}) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const encaminhar = useEncaminhar(t("Mensagem encaminhada."));
  const lista = useQuery({
    queryKey: ["encaminhar-busca", busca],
    enabled: Boolean(props.mensagemId),
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: "20", exclude_finished: "false" });
      if (busca.trim().length >= 2) qs.set("search", busca.trim());
      return (await apiClient.get<{ data: ConversaDaLista[] }>(`/api/v1/conversations?${qs.toString()}`)).data ?? [];
    },
    staleTime: 15_000,
  });
  const fechar = () => {
    setEscolhidas([]);
    setBusca("");
    props.onClose();
  };
  const conversas = (lista.data ?? []).filter((c) => c.id !== props.conversaAtual);

  return (
    <Dialog open={Boolean(props.mensagemId)} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Encaminhar mensagem")}</DialogTitle>
          <DialogDescription>{t("Escolha até 5 conversas. A mensagem sai em seu nome.")}</DialogDescription>
        </DialogHeader>
        <Input
          aria-label={t("Buscar conversa")}
          placeholder={t("Nome ou telefone do contato")}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <ul className="max-h-72 space-y-1 overflow-y-auto" data-testid="encaminhar-lista">
          {conversas.map((c) => {
            const nome = rotuloDoContato(c.contacts, t);
            const marcada = escolhidas.includes(c.id);
            return (
              <li key={c.id}>
                <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={marcada}
                    disabled={!marcada && escolhidas.length >= MAX}
                    onChange={(e) =>
                      setEscolhidas((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))
                    }
                  />
                  <span className="truncate">{nome}</span>
                  {c.contacts?.phone_number && nome !== c.contacts.phone_number ? (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.contacts.phone_number}</span>
                  ) : null}
                </label>
              </li>
            );
          })}
          {!lista.isLoading && conversas.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{t("Nenhuma conversa encontrada.")}</li>
          ) : null}
        </ul>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={fechar}>
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            disabled={escolhidas.length === 0 || encaminhar.isPending}
            data-testid="encaminhar-enviar"
            onClick={() => {
              if (!props.mensagemId) return;
              encaminhar.mutate({ id: props.mensagemId, conversation_ids: escolhidas }, { onSuccess: fechar });
            }}
          >
            {t("Encaminhar")}
            {escolhidas.length > 0 ? ` (${escolhidas.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
